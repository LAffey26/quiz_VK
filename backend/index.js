// backend/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("./db");

const app = express();
const PORT = 3000;
const JWT_SECRET = "super-secret-key-123";

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const activeRooms = {};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ error: "Доступ запрещен. Отсутствует токен." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Неверный или просроченный токен." });
  }
};

// HTTP РОУТЫ СЕРВЕРА
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Бэкенд работает!" });
});

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Имя и пароль обязательны" });
  try {
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser)
      return res
        .status(400)
        .json({ error: "Пользователь с таким именем уже существует" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { username, password: hashedPassword },
    });
    res.status(201).json({
      message: "Пользователь создан!",
      user: { id: newUser.id, username: newUser.username },
    });
  } catch (e) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Имя и пароль обязательны" });
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user)
      return res.status(400).json({ error: "Неверное имя или пароль" });
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      return res.status(400).json({ error: "Неверное имя или пароль" });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "1d",
    });
    res.json({
      message: "Вход выполнен!",
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (e) {
    res.status(500).json({ error: "Ошибка авторизации" });
  }
});

app.post("/api/quizzes", authenticateToken, async (req, res) => {
  const { title, description } = req.body;
  if (!title)
    return res.status(400).json({ error: "Название квиза обязательно" });
  try {
    const newQuiz = await prisma.quiz.create({
      data: { title, description, authorId: req.userId },
    });
    res.status(201).json({ message: "Квиз создан!", quiz: newQuiz });
  } catch (e) {
    res.status(500).json({ error: "Ошибка при создании квиза" });
  }
});

app.get("/api/quizzes", authenticateToken, async (req, res) => {
  try {
    const quizzes = await prisma.quiz.findMany({
      where: { authorId: req.userId },
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(quizzes);
  } catch (e) {
    res.status(500).json({ error: "Ошибка" });
  }
});

app.get("/api/quizzes/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: Number(id), authorId: req.userId },
    });
    if (!quiz) return res.status(404).json({ error: "Квиз не найден" });
    res.json(quiz);
  } catch (e) {
    res.status(500).json({ error: "Ошибка" });
  }
});

app.delete("/api/quizzes/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.quiz.delete({ where: { id: Number(id) } });
    res.json({ message: "Удалено" });
  } catch (e) {
    res.status(500).json({ error: "Ошибка при удалении" });
  }
});

app.post(
  "/api/quizzes/:quizId/questions",
  authenticateToken,
  async (req, res) => {
    const { quizId } = req.params;
    const { text, timeLimit, answers } = req.body;
    try {
      const newQuestion = await prisma.question.create({
        data: {
          text,
          timeLimit: Number(timeLimit),
          quizId: Number(quizId),
          answers: {
            create: answers.map((ans) => ({
              text: ans.text,
              isCorrect: ans.isCorrect,
            })),
          },
        },
        include: { answers: true },
      });
      res.status(201).json({ question: newQuestion });
    } catch (e) {
      res.status(500).json({ error: "Ошибка" });
    }
  },
);

app.put(
  "/api/quizzes/:quizId/questions/:questionId",
  authenticateToken,
  async (req, res) => {
    const { questionId } = req.params;
    const { text, timeLimit, answers } = req.body;
    try {
      await prisma.$transaction([
        prisma.answer.deleteMany({ where: { questionId: Number(questionId) } }),
        prisma.question.update({
          where: { id: Number(questionId) },
          data: {
            text,
            timeLimit: Number(timeLimit),
            answers: {
              create: answers.map((ans) => ({
                text: ans.text,
                isCorrect: ans.isCorrect,
              })),
            },
          },
        }),
      ]);
      res.json({ message: "Обновлено" });
    } catch (e) {
      res.status(500).json({ error: "Ошибка" });
    }
  },
);

app.delete(
  "/api/quizzes/:quizId/questions/:questionId",
  authenticateToken,
  async (req, res) => {
    const { questionId } = req.params;
    try {
      await prisma.question.delete({ where: { id: Number(questionId) } });
      res.json({ message: "Удалено" });
    } catch (e) {
      res.status(500).json({ error: "Ошибка" });
    }
  },
);

app.get(
  "/api/quizzes/:quizId/questions",
  authenticateToken,
  async (req, res) => {
    try {
      const questions = await prisma.question.findMany({
        where: { quizId: Number(req.params.quizId) },
        include: { answers: true },
      });
      res.json(questions);
    } catch (e) {
      res.status(500).json({ error: "Ошибка" });
    }
  },
);

app.get("/api/hub/play/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const quiz = await prisma.quiz.findUnique({
      where: { id: Number(id) },
      include: {
        author: { select: { username: true } },
        _count: { select: { questions: true } },
      },
    });
    if (!quiz) return res.status(404).json({ error: "Не найден" });
    if (quiz._count.questions === 0)
      return res.status(400).json({ error: "В квизе нет вопросов" });
    res.json(quiz);
  } catch (e) {
    res.status(500).json({ error: "Ошибка" });
  }
});

app.get("/api/hub/game-history", authenticateToken, async (req, res) => {
  try {
    const history = await prisma.gameHistory.findMany({
      orderBy: { playedAt: "desc" },
      take: 10,
    });
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: "Ошибка при загрузке истории" });
  }
});

app.get("/api/hub/top-winners", authenticateToken, async (req, res) => {
  try {
    const topWinners = await prisma.user.findMany({
      where: { winsCount: { gt: 0 } },
      orderBy: { winsCount: "desc" },
      take: 5,
    });
    res.json(topWinners);
  } catch (e) {
    res.status(500).json({ error: "Ошибка при загрузке топа победителей" });
  }
});

io.on("connection", (socket) => {
  console.log(`Подключился: ${socket.id}`);

  // Ведущий запускает игру (создает комнату)
  socket.on("host_create_room", async ({ quizId }) => {
    let pin;
    do {
      pin = Math.floor(1000 + Math.random() * 9000).toString();
    } while (activeRooms[pin]);

    try {
      const questions = await prisma.question.findMany({
        where: { quizId: Number(quizId) },
        include: { answers: true },
      });

      if (questions.length === 0) {
        socket.emit("error", { message: "В квизе нет вопросов." });
        return;
      }

      activeRooms[pin] = {
        quizId,
        hostSocketId: socket.id,
        status: "LOBBY",
        questions,
        currentQuestionIndex: 0,
        players: [],
        answersReceived: 0,
        playerAnswers: {}, // Теперь ключами будут имена игроков (username), а не socketId!
      };

      socket.join(pin);
      socket.emit("room_created", { pin, quizId });
    } catch (err) {
      socket.emit("error", { message: "Ошибка при создании комнаты." });
    }
  });

  // Игрок заходит в лобби (ОБНОВЛЕНО: Поддерживает вход во время игры и перезаход без потери очков!)
  socket.on("player_join_room", ({ pin, username }) => {
    const room = activeRooms[pin];
    if (!room) {
      socket.emit("error", { message: "Комната не найдена." });
      return;
    }
    if (room.status === "LEADERBOARD") {
      socket.emit("error", { message: "Квиз уже завершился." });
      return;
    }

    // Проверяем, есть ли уже игрок с таким именем в комнате (Решаем проблему вылета)
    const existingPlayer = room.players.find((p) => p.username === username);

    if (existingPlayer) {
      // ПЕРЕПОДКЛЮЧЕНИЕ: Игрок просто перезагрузил страницу или переподключился!
      existingPlayer.socketId = socket.id; // Перезаписываем сокет на новый
      socket.join(pin);
      socket.emit("player_joined_success", { pin, username });

      // Оповещаем ведущего об обновлении списка сокетов
      io.to(pin).emit("room_players_update", room.players);
      console.log(`Игрок ${username} успешно переподключился в комнату ${pin}`);

      // Если игра уже идет, СРАЗУ отправляем переподключившемуся игроку текущий активный вопрос
      if (room.status === "PLAYING") {
        const question = room.questions[room.currentQuestionIndex];
        const safeAnswersForPlayers = question.answers.map((ans) => ({
          id: ans.id,
          text: ans.text,
        }));

        socket.emit("next_question", {
          questionText: question.text,
          timeLimit: question.timeLimit,
          answers: safeAnswersForPlayers,
          currentQuestionIndex: room.currentQuestionIndex,
          totalQuestions: room.questions.length,
          isHostView: false,
        });
      }
      return;
    }

    const newPlayer = { socketId: socket.id, username, score: 0 };
    room.players.push(newPlayer);

    socket.join(pin);
    socket.emit("player_joined_success", { pin, username });
    io.to(pin).emit("room_players_update", room.players);

    console.log(
      `Новый игрок ${username} зашел в комнату ${pin} ${room.status === "PLAYING" ? "во время матча" : ""}`,
    );

    // Если игра уже идет, сразу отправляем новому игроку текущий вопрос
    if (room.status === "PLAYING") {
      const question = room.questions[room.currentQuestionIndex];
      const safeAnswersForPlayers = question.answers.map((ans) => ({
        id: ans.id,
        text: ans.text,
      }));

      socket.emit("next_question", {
        questionText: question.text,
        timeLimit: question.timeLimit,
        answers: safeAnswersForPlayers,
        currentQuestionIndex: room.currentQuestionIndex,
        totalQuestions: room.questions.length,
        isHostView: false,
      });
    }
  });

  socket.on("host_start_game", async ({ pin }) => {
    const room = activeRooms[pin];
    if (!room || room.hostSocketId !== socket.id) return;

    room.status = "PLAYING";
    room.currentQuestionIndex = 0;

    try {
      await prisma.quiz.update({
        where: { id: Number(room.quizId) },
        data: { playCount: { increment: 1 } },
      });
    } catch (e) {
      console.error(e);
    }

    sendQuestion(pin);
  });

  function sendQuestion(pin) {
    const room = activeRooms[pin];
    if (!room) return;

    room.answersReceived = 0;
    room.playerAnswers = {};
    const question = room.questions[room.currentQuestionIndex];
    const correctAnswer = question.answers.find((ans) => ans.isCorrect);

    const safeAnswersForPlayers = question.answers.map((ans) => ({
      id: ans.id,
      text: ans.text,
    }));

    // Игрокам
    socket.to(pin).emit("next_question", {
      questionText: question.text,
      timeLimit: question.timeLimit,
      answers: safeAnswersForPlayers,
      currentQuestionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      isHostView: false,
    });

    // Ведущему
    io.to(room.hostSocketId).emit("next_question", {
      questionText: question.text,
      timeLimit: question.timeLimit,
      answers: question.answers.map((ans) => ({
        id: ans.id,
        text: ans.text,
        isCorrect: ans.isCorrect,
      })),
      currentQuestionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      correctAnswerId: correctAnswer ? correctAnswer.id : null,
      isHostView: true,
    });
  }

  socket.on("player_submit_answer", ({ pin, answerId }) => {
    const room = activeRooms[pin];
    if (!room || room.status !== "PLAYING") return;

    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    if (room.playerAnswers[player.username]) return;

    const question = room.questions[room.currentQuestionIndex];
    const selectedAnswer = question.answers.find(
      (ans) => ans.id === Number(answerId),
    );
    const isCorrect = selectedAnswer ? selectedAnswer.isCorrect : false;

    if (isCorrect) {
      player.score += 1; // 1 звезда
    }

    room.playerAnswers[player.username] = { isCorrect };
    room.answersReceived += 1;

    io.to(room.hostSocketId).emit("host_answers_count_update", {
      answersReceived: room.answersReceived,
      totalPlayers: room.players.length,
    });

    if (room.answersReceived === room.players.length) {
      revealQuestionResults(pin);
    }
  });

  socket.on("host_reveal_results", ({ pin }) => {
    revealQuestionResults(pin);
  });

  function revealQuestionResults(pin) {
    const room = activeRooms[pin];
    if (!room) return;

    const question = room.questions[room.currentQuestionIndex];
    const correctAnswer = question.answers.find((ans) => ans.isCorrect);

    io.to(pin).emit("question_results", {
      correctAnswerId: correctAnswer ? correctAnswer.id : null,
      correctAnswerText: correctAnswer ? correctAnswer.text : "",
      playerAnswers: room.playerAnswers,
      players: room.players,
    });
  }

  socket.on("host_next_step", async ({ pin }) => {
    const room = activeRooms[pin];
    if (!room) return;

    room.currentQuestionIndex += 1;

    if (room.currentQuestionIndex < room.questions.length) {
      sendQuestion(pin);
    } else {
      room.status = "LEADERBOARD";

      const sortedLeaderboard = [...room.players].sort(
        (a, b) => b.score - a.score,
      );
      const winner = sortedLeaderboard[0];

      try {
        const quiz = await prisma.quiz.findUnique({
          where: { id: Number(room.quizId) },
        });

        const resultsJsonString = JSON.stringify(
          sortedLeaderboard.map((p) => ({
            username: p.username,
            score: p.score,
          })),
        );

        await prisma.gameHistory.create({
          data: {
            quizTitle: quiz ? quiz.title : "Неизвестный квиз",
            winnerName: winner ? winner.username : "Никто",
            playersCount: room.players.length,
            resultsJson: resultsJsonString,
          },
        });

        for (let i = 0; i < sortedLeaderboard.length; i++) {
          const p = sortedLeaderboard[i];
          const isWinner = i === 0;

          try {
            // 1. Ищем игрока в БД по имени
            const dbUser = await prisma.user.findUnique({
              where: { username: p.username },
            });

            if (dbUser) {
              const updateData = {
                starsCount: dbUser.starsCount + p.score,
              };

              if (isWinner) {
                updateData.winsCount = dbUser.winsCount + 1;
              }

              await prisma.user.update({
                where: { id: dbUser.id },
                data: updateData,
              });

              console.log(
                `[УСПЕХ] Статистика ${p.username} обновлена: +${p.score} звезд. Победитель: ${isWinner}`,
              );
            } else {
              console.warn(
                `[ПРЕДУПРЕЖДЕНИЕ] Игрок ${p.username} не найден в БД (возможно, гость).`,
              );
            }
          } catch (userUpdateError) {
            console.error(
              `[ОШИБКА] Не удалось обновить статистику игрока ${p.username}:`,
              userUpdateError,
            );
          }
        }
      } catch (err) {
        console.error("Ошибка сохранения итогов игры:", err);
      }

      io.to(pin).emit("game_over", { leaderboard: sortedLeaderboard });
    }
  });

  socket.on("disconnect", () => {
    for (const pin in activeRooms) {
      const room = activeRooms[pin];

      // Если вышел ведущий - закрываем
      if (room.hostSocketId === socket.id) {
        io.to(pin).emit("error", { message: "Ведущий вышел. Игра закрыта." });
        delete activeRooms[pin];
        break;
      }

      // Если вышел игрок - мы НЕ удаляем его из списка players сразу (чтобы он мог перезайти со своим счетом)!
      const player = room.players.find((p) => p.socketId === socket.id);
      if (player) {
        console.log(
          `Игрок ${player.username} временно отвалился от комнаты ${pin}`,
        );
        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});

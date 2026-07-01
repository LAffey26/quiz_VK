import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./App.css";

function App() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);

  // Управление экранами: 'hub', 'profile', 'create-quiz', 'manage-questions', 'host-lobby', 'player-lobby', 'game-screen'
  const [currentView, setCurrentView] = useState("hub");

  // Сокеты
  const socketRef = useRef(null);
  const [roomPin, setPin] = useState("");
  const [gamePlayers, setGamePlayers] = useState([]);

  // Состояние активного вопроса в игре
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [timer, setTimer] = useState(0);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedAnswerId, setSelectedAnswerId] = useState(null);
  const [answersCount, setAnswersCount] = useState({ received: 0, total: 0 });
  const [questionResults, setQuestionResults] = useState(null);
  const [finalLeaderboard, setFinalLeaderboard] = useState(null);
  const [gameDate, setGameDate] = useState(null);
  const timerIntervalRef = useRef(null);

  // Данные хаба (История игр и ТОП победителей)
  const [gameHistory, setGameHistory] = useState([]);
  const [topWinners, setTopWinners] = useState([]);
  const [playSearchId, setPlaySearchId] = useState("");

  // Мои квизы
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [editingQuestionId, setEditingQuestionId] = useState(null);

  // Формы квиза/вопроса
  const [newQuizTitle, setNewQuizTitle] = useState("");
  const [newQuizDesc, setNewQuizDesc] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [timeLimit, setTimeLimit] = useState(30);
  const [answersList, setAnswersList] = useState([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ]);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }

    socketRef.current = io("http://localhost:3000");

    socketRef.current.on("room_created", ({ pin }) => {
      setPin(pin);
      setGamePlayers([]);
      setCurrentView("host-lobby");
    });

    socketRef.current.on("room_players_update", (players) => {
      setGamePlayers(players);
    });

    socketRef.current.on("player_joined_success", ({ pin }) => {
      setPin(pin);
      setCurrentView("player-lobby");
    });

    socketRef.current.on("next_question", (questionData) => {
      setActiveQuestion(questionData);
      setTimer(questionData.timeLimit);
      setHasAnswered(false);
      setSelectedAnswerId(null);
      setQuestionResults(null);
      setAnswersCount({ received: 0, total: gamePlayers.length });
      setCurrentView("game-screen");
    });

    socketRef.current.on(
      "host_answers_count_update",
      ({ answersReceived, totalPlayers }) => {
        setAnswersCount({ received: answersReceived, total: totalPlayers });
      },
    );

    socketRef.current.on("question_results", (results) => {
      setQuestionResults(results);
      setGamePlayers(results.players);
    });

    socketRef.current.on("game_over", ({ leaderboard }) => {
      setFinalLeaderboard(leaderboard);
      setQuestionResults(null);
      setActiveQuestion(null);
    });

    socketRef.current.on("error", (err) => {
      alert(err.message);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  // Таймер обратного отсчета
  useEffect(() => {
    if (
      currentView === "game-screen" &&
      activeQuestion &&
      timer > 0 &&
      !questionResults
    ) {
      timerIntervalRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            const isHost =
              !user ||
              quizzes.some(
                (q) => q.id === selectedQuiz?.id && q.authorId === user.id,
              );
            if (isHost) {
              socketRef.current.emit("host_reveal_results", { pin: roomPin });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [currentView, activeQuestion, timer, questionResults]);

  useEffect(() => {
    if (user && currentView === "hub") {
      fetchHubData();
    } else if (user && currentView === "profile") {
      fetchMyQuizzes();
    }
  }, [user, currentView]);

  const fetchHubData = async () => {
    const token = localStorage.getItem("token");
    try {
      const [histRes, topRes] = await Promise.all([
        fetch("http://localhost:3000/api/hub/game-history", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("http://localhost:3000/api/hub/top-winners", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (histRes.ok) setGameHistory(await histRes.json());
      if (topRes.ok) setTopWinners(await topRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMyQuizzes = async () => {
    const token = localStorage.getItem("token");
    try {
      const response = await fetch("http://localhost:3000/api/quizzes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setQuizzes(await response.json());
    } catch (err) {
      console.error(err);
    }
  };

  // ----- СОКЕТНЫЕ МЕТОДЫ ИГРЫ -----
  const handleHostGame = (quizId) => {
    const quiz = quizzes.find((q) => q.id === quizId);
    setSelectedQuiz(quiz);
    socketRef.current.emit("host_create_room", { quizId });
  };

  const handleSearchPlayQuiz = (e) => {
    e.preventDefault();
    if (!playSearchId) return;
    socketRef.current.emit("player_join_room", {
      pin: playSearchId,
      username: user.username,
    });
    setPlaySearchId("");
  };

  const handleQuickPlay = (quizId) => {
    const quiz = popularQuizzes.find((q) => q.id === quizId);
    setSelectedQuiz(quiz);
    socketRef.current.emit("host_create_room", { quizId });
  };

  const handleStartGame = () => {
    socketRef.current.emit("host_start_game", { pin: roomPin });
  };

  const handleSendAnswer = (answerId) => {
    if (hasAnswered) return;
    setHasAnswered(true);
    setSelectedAnswerId(answerId);
    socketRef.current.emit("player_submit_answer", { pin: roomPin, answerId });
  };

  const handleRevealResults = () => {
    socketRef.current.emit("host_reveal_results", { pin: roomPin });
  };

  const handleNextStep = () => {
    socketRef.current.emit("host_next_step", { pin: roomPin });
  };

  const handleLeaveGame = () => {
    setPin("");
    setActiveQuestion(null);
    setQuestionResults(null);
    setFinalLeaderboard(null);
    setGameDate(null);
    setGamePlayers([]);
    setCurrentView("hub");
  };

  // Открыть историю матча на полный экран
  const handleShowHistoryLeaderboard = (game) => {
    setSelectedQuiz({ title: game.quizTitle });

    const formattedDate = new Date(game.playedAt).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    setGameDate(formattedDate);

    const parsedLeaderboard = JSON.parse(game.resultsJson || "[]");
    setFinalLeaderboard(parsedLeaderboard);
  };

  // ----- ОСТАЛЬНЫЕ МЕТОДЫ -----
  const handleSubmitAuth = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const endpoint = isLogin ? "login" : "register";
    try {
      const response = await fetch(
        `http://localhost:3000/api/auth/${endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (isLogin) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setUser(data.user);
      } else {
        setMessage("Успешно! Войдите.");
        setIsLogin(true);
      }
      setUsername("");
      setPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    setCurrentView("hub");
  };
  const fetchQuestions = async (quizId) => {
    const token = localStorage.getItem("token");
    const res = await fetch(
      `http://localhost:3000/api/quizzes/${quizId}/questions`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) setQuestions(await res.json());
  };
  const handleOpenQuestions = (quiz) => {
    setSelectedQuiz(quiz);
    fetchQuestions(quiz.id);
    setCurrentView("manage-questions");
    handleResetQuestionForm();
  };
  const handleCreateQuiz = async (e) => {
    e.preventDefault();
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:3000/api/quizzes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: newQuizTitle, description: newQuizDesc }),
    });
    setLoading(false);
    if (res.ok) {
      setNewQuizTitle("");
      setNewQuizDesc("");
      setCurrentView("profile");
    }
  };
  const handleDeleteQuiz = async (quizId, e) => {
    e.stopPropagation();
    if (!window.confirm("Удалить квиз?")) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`http://localhost:3000/api/quizzes/${quizId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchMyQuizzes();
  };
  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    setLoading(true);
    const token = localStorage.getItem("token");
    const url = editingQuestionId
      ? `http://localhost:3000/api/quizzes/${selectedQuiz.id}/questions/${editingQuestionId}`
      : `http://localhost:3000/api/quizzes/${selectedQuiz.id}/questions`;
    const res = await fetch(url, {
      method: editingQuestionId ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text: questionText,
        timeLimit,
        answers: answersList,
      }),
    });
    setLoading(false);
    if (res.ok) {
      handleResetQuestionForm();
      fetchQuestions(selectedQuiz.id);
    }
  };
  const handleStartEditQuestion = (q) => {
    setEditingQuestionId(q.id);
    setQuestionText(q.text);
    setTimeLimit(q.timeLimit);
    setAnswersList(
      q.answers.map((a) => ({ text: a.text, isCorrect: a.isCorrect })),
    );
  };
  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm("Удалить вопрос?")) return;
    const token = localStorage.getItem("token");
    const res = await fetch(
      `http://localhost:3000/api/quizzes/${selectedQuiz.id}/questions/${qId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      if (editingQuestionId === qId) handleResetQuestionForm();
      fetchQuestions(selectedQuiz.id);
    }
  };
  const handleResetQuestionForm = () => {
    setQuestionText("");
    setTimeLimit(30);
    setAnswersList([
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ]);
    setEditingQuestionId(null);
  };
  const handleAnswerTextChange = (i, v) => {
    const arr = [...answersList];
    arr[i].text = v;
    setAnswersList(arr);
  };
  const handleSetCorrectAnswer = (i) => {
    setAnswersList(
      answersList.map((a, idx) => ({ ...a, isCorrect: idx === i })),
    );
  };
  const handleAddAnswerField = () =>
    setAnswersList([...answersList, { text: "", isCorrect: false }]);
  const handleRemoveAnswerField = (i) => {
    if (answersList.length <= 2) return;
    const arr = answersList.filter((_, idx) => idx !== i);
    if (answersList[i].isCorrect && arr.length) arr[0].isCorrect = true;
    setAnswersList(arr);
  };

  const isHost =
    selectedQuiz &&
    user &&
    quizzes.some((q) => q.id === selectedQuiz.id && q.authorId === user.id);

  if (user) {
    return (
      <div className="app-layout">
        {/* СКРЫВАЕМ ШАПКУ, ЕСЛИ ИДЕТ ИГРА ИЛИ НА ЭКРАНЕ ФИНАЛЬНЫЙ ЛИДЕРБОРД */}
        {!roomPin && !finalLeaderboard && (
          <header className="main-header">
            <div className="header-left">
              <h1 className="logo" onClick={() => setCurrentView("hub")}>
                QuizApp
              </h1>
              <button
                className={`nav-btn ${currentView === "profile" ? "active" : ""}`}
                onClick={() => setCurrentView("profile")}
              >
                Мой Профиль
              </button>
            </div>
            <div className="header-right">
              {/* УБРАЛИ ЛИШНИЙ ИНПУТ ПОИСКА ПИН-КОДА — ШАПКА ТЕПЕРЬ СВОБОДНА! */}
              <span className="user-badge">{user.username}</span>
              <button onClick={handleLogout} className="logout-header-btn">
                Выйти
              </button>
            </div>
          </header>
        )}

        <main className="main-content">
          {/* СЦЕНА А: ХОСТ-ЛОББИ */}
          {currentView === "host-lobby" && (
            <div className="auth-card game-lobby-card">
              <h2>Комната ожидания игры</h2>
              <div className="pin-banner">
                <span className="pin-label">ПИН-КОД ДЛЯ ВХОДА:</span>
                <span className="pin-value">{roomPin}</span>
              </div>
              <p className="welcome-text">
                Квиз: <strong>{selectedQuiz?.title}</strong>
              </p>

              <div className="lobby-players-section">
                <h3>Подключилось участников ({gamePlayers.length})</h3>
                {gamePlayers.length === 0 ? (
                  <p className="loading-players-pulse">
                    Ожидание подключения игроков...
                  </p>
                ) : (
                  <div className="lobby-players-grid">
                    {gamePlayers.map((p) => (
                      <div key={p.socketId} className="lobby-player-tag">
                        {p.username}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleStartGame}
                disabled={gamePlayers.length === 0}
                className="submit-btn start-game-btn"
              >
                Начать игру!
              </button>
              <button
                onClick={handleLeaveGame}
                className="back-btn close-lobby-btn"
              >
                Отменить
              </button>
            </div>
          )}

          {/* СЦЕНА Б: ИГРОК-ЛОББИ */}
          {currentView === "player-lobby" && (
            <div className="auth-card game-lobby-card">
              <h2>Вы в лобби игры!</h2>
              <div className="pin-banner success-banner">
                <span className="pin-label">КОД КОМНАТЫ:</span>
                <span className="pin-value">{roomPin}</span>
              </div>
              <p className="welcome-text">
                Ваше имя в игре: <strong>{user.username}</strong>
              </p>
              <div className="lobby-waiting-pulse">
                <div className="spinner"></div>
                <p>Ведущий скоро запустит первый вопрос. Не отключайтесь!</p>
              </div>
              <button
                onClick={handleLeaveGame}
                className="logout-btn leave-game-link"
              >
                Покинуть лобби
              </button>
            </div>
          )}

          {/* СЦЕНА В: ЭКРАН ИГРЫ */}
          {currentView === "game-screen" && activeQuestion && (
            <div className="auth-card game-screen-card">
              <div className="game-screen-workspace">
                {/* ЛЕВАЯ КОЛОНКА: ЛИДЕРБОРД УЧАСТНИКОВ (ЗВЕЗДОЧКИ) */}
                <div className="game-live-leaderboard">
                  <h3>Рейтинг участников</h3>
                  <div className="live-players-list">
                    {gamePlayers.map((p) => (
                      <div key={p.socketId} className="live-player-row">
                        <span className="live-player-name">{p.username}</span>
                        <span className="live-player-stars">
                          {Array.from({ length: p.score }).map((_, i) => (
                            <span key={i} className="star-icon">
                              ★
                            </span>
                          ))}
                          {p.score === 0 && (
                            <span className="no-stars-text">-</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ПРАВАЯ КОЛОНКА: ТЕКСТ ВОПРОСА И СТРОЧКИ ОТВЕТОВ */}
                <div className="game-main-area">
                  <div className="game-screen-header">
                    <span className="q-progress">
                      Вопрос {activeQuestion.currentQuestionIndex + 1} из{" "}
                      {activeQuestion.totalQuestions}
                      {/* НОВОЕ: Показываем ПИН-код прямо во время игры в шапке! */}
                      <span className="header-pin-badge">
                        {" "}
                        | PIN: <strong>{roomPin}</strong>
                      </span>
                    </span>
                    <span
                      className={`timer-badge ${timer <= 5 ? "timer-danger" : ""}`}
                    >
                      {timer} сек.
                    </span>
                  </div>

                  <h2 className="game-question-title">
                    {activeQuestion.questionText}
                  </h2>

                  {/* Белые горизонтальные варианты ответов в виде строчек */}
                  <div className="game-answers-list">
                    {activeQuestion.answers.map((ans, idx) => {
                      const isSelected = selectedAnswerId === ans.id;
                      let extraClass = "";

                      const isHostViewAndCorrect =
                        activeQuestion.isHostView && ans.isCorrect;

                      if (questionResults) {
                        if (ans.id === questionResults.correctAnswerId) {
                          extraClass = "correct-reveal";
                        } else if (isSelected) {
                          extraClass = "wrong-reveal";
                        } else {
                          extraClass = "fade-reveal";
                        }
                      } else if (hasAnswered) {
                        extraClass = isSelected
                          ? "selected-pending"
                          : "fade-reveal";
                      } else if (isHostViewAndCorrect) {
                        extraClass = "host-correct-hint";
                      }

                      return (
                        <button
                          key={ans.id}
                          onClick={() => handleSendAnswer(ans.id)}
                          disabled={hasAnswered || !!questionResults || isHost}
                          className={`game-ans-btn-row ${extraClass}`}
                        >
                          <div className="ans-row-left">
                            <span className="ans-row-letter">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="ans-row-text">{ans.text}</span>
                          </div>

                          {/* Зеленая галочка отображается только при вскрытии результатов */}
                          {questionResults &&
                            ans.id === questionResults.correctAnswerId && (
                              <span className="correct-checkmark-icon">✓</span>
                            )}
                        </button>
                      );
                    })}
                  </div>

                  {/* ПОДВАЛ */}
                  <div className="game-screen-footer">
                    {!questionResults ? (
                      <div className="footer-status-row">
                        <p className="answers-counter">
                          Ответов принято:{" "}
                          <strong>{answersCount.received}</strong> из{" "}
                          {answersCount.total}
                        </p>
                        {isHost && (
                          <button
                            onClick={handleRevealResults}
                            className="submit-btn reveal-btn"
                          >
                            Остановить и вскрыть
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="results-panel">
                        <p className="correct-ans-announcement">
                          Правильный ответ:{" "}
                          <strong>
                            {questionResults.correctAnswerText ||
                              "Нет правильного"}
                          </strong>
                        </p>
                        {isHost ? (
                          <button
                            onClick={handleNextStep}
                            className="submit-btn next-q-btn"
                          >
                            Дальше &rarr;
                          </button>
                        ) : (
                          <p className="waiting-host-pulse">
                            Ведущий переключает слайд...
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* СЦЕНА Г: ФИНАЛЬНЫЙ ЛИДЕРБОРД */}
          {finalLeaderboard && (
            <div className="auth-card game-lobby-card leaderboard-reveal-card">
              <h2>🏆 Итоги игры 🏆</h2>
              <p className="welcome-text">
                Квиз: <strong>{selectedQuiz?.title}</strong>
              </p>
              {gameDate && (
                <p className="subtitle" style={{ marginBottom: "16px" }}>
                  Сыграно: {gameDate}
                </p>
              )}

              {finalLeaderboard.length === 0 ? (
                <div
                  className="dashboard-placeholder"
                  style={{ padding: "20px" }}
                >
                  <p>
                    Подробная турнирная таблица участников для этой старой игры
                    отсутствует.
                  </p>
                </div>
              ) : (
                <div className="leaderboard-podium">
                  {finalLeaderboard.map((player, idx) => {
                    const medals = ["🥇", "🥈", "🥉"];
                    return (
                      <div key={idx} className={`podium-item place-${idx + 1}`}>
                        <span className="podium-rank">
                          {medals[idx] || `[#${idx + 1}]`}
                        </span>
                        <span className="podium-name">{player.username}</span>
                        <span className="podium-score">
                          {Array.from({ length: player.score }).map((_, i) => (
                            <span key={i} className="star-icon">
                              ★
                            </span>
                          ))}
                          {player.score === 0 && "0 звезд"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={handleLeaveGame}
                className="submit-btn start-game-btn"
              >
                Вернуться на главную
              </button>
            </div>
          )}

          {/* ДЕФОЛТНЫЙ ЭКРАН ХАБА */}
          {currentView === "hub" && !finalLeaderboard && (
            <div className="hub-container">
              {/* Левая колонка: История сыгранных игр */}
              <div className="hub-left">
                <div className="hub-join-card">
                  <h3>Войти в активную игру по PIN-коду</h3>
                  <form
                    onSubmit={handleSearchPlayQuiz}
                    className="hub-join-form"
                  >
                    <input
                      type="number"
                      placeholder="Введите ПИН-код комнаты (например, 1996)..."
                      value={playSearchId}
                      onChange={(e) => setPlaySearchId(e.target.value)}
                      required
                    />
                    <button type="submit" className="hub-join-btn">
                      Войти в лобби
                    </button>
                  </form>
                </div>

                <h2 className="section-title">
                  История сыгранных игр (кликните для результатов)
                </h2>
                {gameHistory.length === 0 ? (
                  <p className="empty-text">
                    История игр пока пуста. Будьте первыми, кто сыграет матч!
                  </p>
                ) : (
                  <div className="hub-list">
                    {gameHistory.map((game) => (
                      <div
                        key={game.id}
                        className="hub-quiz-card history-card"
                        onClick={() => handleShowHistoryLeaderboard(game)}
                      >
                        <div className="hq-info">
                          <h3>{game.quizTitle}</h3>
                          <div className="hq-meta">
                            <span>
                              Победитель:{" "}
                              <strong className="winner-highlight">
                                🏆 {game.winnerName}
                              </strong>
                            </span>
                            <span>
                              Участников: <strong>{game.playersCount}</strong>
                            </span>
                            <span>
                              Дата:{" "}
                              <strong>
                                {new Date(game.playedAt).toLocaleDateString()}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Правая колонка: ТОП Победителей */}
              <div className="hub-right">
                <h2 className="section-title">Топ победителей</h2>
                {topWinners.length === 0 ? (
                  <p className="empty-text">Победителей пока нет.</p>
                ) : (
                  <div className="top-creators-list">
                    {topWinners.map((winner, idx) => (
                      <div key={winner.id} className="creator-item">
                        <span className="creator-rank">#{idx + 1}</span>
                        <span className="creator-name">{winner.username}</span>
                        <div className="winner-stats-badge">
                          <span className="creator-count">
                            {winner.winsCount} 🏆
                          </span>
                          <span className="stars-total">
                            {winner.starsCount} ★
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === "profile" && (
            <div className="auth-container">
              <div className="auth-card dashboard-card">
                <div className="header-row">
                  <h2>Панель Организатора</h2>
                </div>
                {quizzes.length === 0 ? (
                  <div className="dashboard-placeholder">
                    <p>Вы еще не создали ни одного квиза.</p>
                    <button
                      onClick={() => setCurrentView("create-quiz")}
                      className="submit-btn create-btn"
                    >
                      Создать первый квиз
                    </button>
                  </div>
                ) : (
                  <div className="quizzes-list-container">
                    <button
                      onClick={() => setCurrentView("create-quiz")}
                      className="submit-btn create-btn-small"
                    >
                      + Создать новый квиз
                    </button>
                    <div className="quizzes-list">
                      {quizzes.map((quiz) => (
                        <div key={quiz.id} className="quiz-item">
                          <div className="quiz-info">
                            <h3>{quiz.title}</h3>
                            <p className="quiz-meta">
                              ID: <strong>{quiz.id}</strong> | Вопросов:{" "}
                              <strong>{quiz._count?.questions || 0}</strong>
                            </p>
                          </div>
                          <div className="quiz-actions-row">
                            <button
                              onClick={() => handleHostGame(quiz.id)}
                              className="host-btn"
                            >
                              Запустить
                            </button>
                            <button
                              onClick={() => handleOpenQuestions(quiz)}
                              className="manage-btn"
                            >
                              Изменить
                            </button>
                            <button
                              onClick={(e) => handleDeleteQuiz(quiz.id, e)}
                              className="delete-quiz-btn"
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === "create-quiz" && (
            <div className="auth-card">
              <h2>Новый Квиз</h2>
              <p className="subtitle">Укажите название и описание игры</p>
              <form onSubmit={handleCreateQuiz} className="auth-form">
                <div className="input-group">
                  <label>Название квиза</label>
                  <input
                    type="text"
                    value={newQuizTitle}
                    onChange={(e) => setNewQuizTitle(e.target.value)}
                    placeholder="Например: Квиз по Гарри Поттеру"
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Описание (необязательно)</label>
                  <textarea
                    value={newQuizDesc}
                    onChange={(e) => setNewQuizDesc(e.target.value)}
                    placeholder="Коротко расскажите о правилах квиза"
                    rows="3"
                  />
                </div>
                <button type="submit" className="submit-btn">
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView("profile")}
                  className="back-btn"
                >
                  Отмена
                </button>
              </form>
            </div>
          )}

          {currentView === "manage-questions" && selectedQuiz && (
            <div className="auth-container">
              <div className="auth-card questions-card">
                <div className="header-row">
                  <h2>Вопросы квиза</h2>
                  <button
                    onClick={() => setCurrentView("profile")}
                    className="logout-link"
                  >
                    &larr; Назад в профиль
                  </button>
                </div>
                <div className="questions-workspace">
                  <div className="questions-list-panel">
                    <h3>Уже добавлено ({questions.length})</h3>
                    <div className="questions-scroll-list">
                      {questions.map((q, idx) => (
                        <div key={q.id} className="question-summary-item">
                          <span className="q-number">{idx + 1}.</span>
                          <div className="q-details-wrapper">
                            <div className="q-details">
                              <p className="q-text">{q.text}</p>
                              <span className="q-time">
                                {q.timeLimit} сек. | Ответов: {q.answers.length}
                              </span>
                            </div>
                            <div className="q-item-actions">
                              <button
                                onClick={() => handleStartEditQuestion(q)}
                                className="q-edit-btn"
                              >
                                Редакт.
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="q-delete-btn"
                              >
                                Удалить
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="add-question-panel">
                    <h3>
                      {editingQuestionId
                        ? "Редактировать вопрос"
                        : "Добавить вопрос"}
                    </h3>
                    <form onSubmit={handleSaveQuestion} className="auth-form">
                      <div className="input-group">
                        <label>Текст вопроса</label>
                        <input
                          type="text"
                          value={questionText}
                          onChange={(e) => setQuestionText(e.target.value)}
                          required
                        />
                      </div>
                      <div className="input-group">
                        <label>Время (секунд)</label>
                        <select
                          value={timeLimit}
                          onChange={(e) => setTimeLimit(Number(e.target.value))}
                        >
                          <option value={10}>10 секунд</option>
                          <option value={20}>20 секунд</option>
                          <option value={30}>30 секунд</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>Варианты ответов</label>
                        <div className="answers-builder">
                          {answersList.map((ans, idx) => (
                            <div key={idx} className="answer-row-input">
                              <input
                                type="radio"
                                checked={ans.isCorrect}
                                onChange={() => handleSetCorrectAnswer(idx)}
                              />
                              <input
                                type="text"
                                value={ans.text}
                                onChange={(e) =>
                                  handleAnswerTextChange(idx, e.target.value)
                                }
                                required
                              />
                              {answersList.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAnswerField(idx)}
                                  className="remove-answer-btn"
                                >
                                  &times;
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={handleAddAnswerField}
                          className="add-answer-btn"
                        >
                          + Добавить вариант
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="submit-btn save-q-btn"
                      >
                        {editingQuestionId
                          ? "Сохранить изменения"
                          : "+ Сохранить вопрос"}
                      </button>
                      {editingQuestionId && (
                        <button
                          type="button"
                          onClick={handleResetQuestionForm}
                          className="back-btn cancel-edit-btn"
                        >
                          Отмена
                        </button>
                      )}
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ФОРМА ВХОДА (Если не авторизован)
  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{isLogin ? "Вход в систему" : "Регистрация"}</h2>
        <form onSubmit={handleSubmitAuth} className="auth-form">
          <div className="input-group">
            <label>Имя</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="submit-btn">
            {isLogin ? "Войти" : "Зарегистрироваться"}
          </button>
          <button
            type="button"
            className="back-btn"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? "Нет аккаунта? Регистрация" : "Есть аккаунт? Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;

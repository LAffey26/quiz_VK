// backend/db.js
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const path = require("path"); // Импортируем path

// Находим точный абсолютный путь к файлу dev.db в корне бэкенда
const dbPath = path.resolve(__dirname, "dev.db");

const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`, // Используем точный абсолютный путь
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;

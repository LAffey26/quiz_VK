-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GameHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quizTitle" TEXT NOT NULL,
    "winnerName" TEXT NOT NULL,
    "playersCount" INTEGER NOT NULL,
    "leaderboard" TEXT NOT NULL DEFAULT '[]',
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_GameHistory" ("id", "playedAt", "playersCount", "quizTitle", "winnerName") SELECT "id", "playedAt", "playersCount", "quizTitle", "winnerName" FROM "GameHistory";
DROP TABLE "GameHistory";
ALTER TABLE "new_GameHistory" RENAME TO "GameHistory";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

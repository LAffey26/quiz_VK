/*
  Warnings:

  - You are about to drop the column `resultsJson` on the `GameHistory` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GameHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quizTitle" TEXT NOT NULL,
    "winnerName" TEXT NOT NULL,
    "playersCount" INTEGER NOT NULL,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_GameHistory" ("id", "playedAt", "playersCount", "quizTitle", "winnerName") SELECT "id", "playedAt", "playersCount", "quizTitle", "winnerName" FROM "GameHistory";
DROP TABLE "GameHistory";
ALTER TABLE "new_GameHistory" RENAME TO "GameHistory";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "LearningPhoto" (
    "id" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "altText" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearningPhoto_slot_key" ON "LearningPhoto"("slot");

-- CreateTable
CREATE TABLE "output_sack_inputs" (
    "id" TEXT NOT NULL,
    "outputSackId" TEXT NOT NULL,
    "inputSackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "output_sack_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "output_sack_inputs_outputSackId_idx" ON "output_sack_inputs"("outputSackId");

-- CreateIndex
CREATE INDEX "output_sack_inputs_inputSackId_idx" ON "output_sack_inputs"("inputSackId");

-- CreateIndex
CREATE UNIQUE INDEX "output_sack_inputs_outputSackId_inputSackId_key" ON "output_sack_inputs"("outputSackId", "inputSackId");

-- AddForeignKey
ALTER TABLE "output_sack_inputs" ADD CONSTRAINT "output_sack_inputs_outputSackId_fkey" FOREIGN KEY ("outputSackId") REFERENCES "sacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "output_sack_inputs" ADD CONSTRAINT "output_sack_inputs_inputSackId_fkey" FOREIGN KEY ("inputSackId") REFERENCES "sacks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


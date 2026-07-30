-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "originPort" TEXT,
ADD COLUMN     "totalPrice" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "provider_shipments" ADD COLUMN     "departureDate" TIMESTAMP(3),
ADD COLUMN     "maritimeDays" INTEGER DEFAULT 30,
ADD COLUMN     "terrestrialDays" INTEGER DEFAULT 7;


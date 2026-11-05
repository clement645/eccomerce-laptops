-- AlterTable
ALTER TABLE "banners" ADD COLUMN     "annotation" TEXT,
ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "titleHighlight" TEXT;

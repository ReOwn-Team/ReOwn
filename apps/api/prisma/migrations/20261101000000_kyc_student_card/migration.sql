-- CreateTable
CREATE TABLE "kyc_submissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "card_layout" VARCHAR(10) NOT NULL,
    "student_id_hmac" VARCHAR(64) NOT NULL,
    "face_score" DOUBLE PRECISION NOT NULL,
    "flags" TEXT[],
    "sealed_payload" BYTEA NOT NULL,
    "consent_version" VARCHAR(40) NOT NULL,
    "consented_at" TIMESTAMPTZ(3) NOT NULL,
    "reviewed_by" UUID,
    "reason" VARCHAR(500),
    "reviewed_at" TIMESTAMPTZ(3),
    "purged_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_assets" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "sealed" BYTEA NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_submissions_user_id_created_at_idx" ON "kyc_submissions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "kyc_submissions_status_created_at_idx" ON "kyc_submissions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_assets_submission_id_kind_key" ON "kyc_assets"("submission_id", "kind");

-- AddForeignKey
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_assets" ADD CONSTRAINT "kyc_assets_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "kyc_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One in-flight or verified submission per user, and one per student card.
-- Rejected, expired and withdrawn rows are excluded so people can retry and a
-- card is released when its account is withdrawn.
CREATE UNIQUE INDEX "kyc_submissions_active_user_key" ON "kyc_submissions"("user_id") WHERE "status" IN ('needs_review', 'verified');
CREATE UNIQUE INDEX "kyc_submissions_active_student_key" ON "kyc_submissions"("student_id_hmac") WHERE "status" IN ('needs_review', 'verified');

ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_status_check" CHECK ("status" IN ('needs_review', 'verified', 'rejected', 'expired', 'withdrawn'));
ALTER TABLE "kyc_assets" ADD CONSTRAINT "kyc_assets_kind_check" CHECK ("kind" IN ('card_front', 'selfie'));

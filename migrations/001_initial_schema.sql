-- Migration: 001_initial_schema.sql
-- Description: Create initial schema for Job Portal & Small Job platform (Core tables based on system design doc DL-01 to DL-11 + notification table & refresh_token fields)
-- Database: PostgreSQL / Supabase

BEGIN;

--------------------------------------------------------------------------------
-- 0. CLEANUP (IF RERUNNING MIGRATION)
--------------------------------------------------------------------------------
DROP TABLE IF EXISTS notification CASCADE;
DROP TABLE IF EXISTS ai_chat_session CASCADE;
DROP TABLE IF EXISTS complaint_report CASCADE;
DROP TABLE IF EXISTS review CASCADE;
DROP TABLE IF EXISTS job_application CASCADE;
DROP TABLE IF EXISTS small_job_registration CASCADE;
DROP TABLE IF EXISTS small_job_posting CASCADE;
DROP TABLE IF EXISTS job_posting CASCADE;
DROP TABLE IF EXISTS employer CASCADE;
DROP TABLE IF EXISTS cv_version CASCADE;
DROP TABLE IF EXISTS candidate_profile CASCADE;
DROP TABLE IF EXISTS account CASCADE;

DROP TYPE IF EXISTS ai_support_type CASCADE;
DROP TYPE IF EXISTS complaint_processing_status CASCADE;
DROP TYPE IF EXISTS job_application_status CASCADE;
DROP TYPE IF EXISTS small_job_registration_status CASCADE;
DROP TYPE IF EXISTS approval_status CASCADE;
DROP TYPE IF EXISTS job_type CASCADE;
DROP TYPE IF EXISTS verification_status CASCADE;
DROP TYPE IF EXISTS account_role CASCADE;

--------------------------------------------------------------------------------
-- 1. CREATE ENUM TYPES
--------------------------------------------------------------------------------

-- Vai trò tài khoản (DL-01: Account.role)
CREATE TYPE account_role AS ENUM (
    'candidate',
    'employer',
    'admin'
);

-- Trạng thái xác minh nhà tuyển dụng (DL-04: Employer.verification_status)
CREATE TYPE verification_status AS ENUM (
    'unverified',
    'pending',
    'verified',
    'rejected'
);

-- Phân loại tin tuyển dụng (DL-05: JobPosting.job_type)
CREATE TYPE job_type AS ENUM (
    'full_time',
    'small_job'
);

-- Trạng thái duyệt tin tuyển dụng (DL-05: JobPosting.approval_status)
CREATE TYPE approval_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'hidden'
);

-- Trạng thái tham gia Small Job (DL-07: SmallJobRegistration.status)
CREATE TYPE small_job_registration_status AS ENUM (
    'registered',
    'confirmed',
    'cancelled',
    'absent',
    'completed'
);

-- Trạng thái nộp và xử lý hồ sơ ứng tuyển (DL-08: JobApplication.status)
CREATE TYPE job_application_status AS ENUM (
    'submitted',
    'received',
    'under_review',
    'interview_invited',
    'interviewed',
    'passed',
    'rejected',
    'withdrawn'
);

-- Trạng thái xử lý báo cáo / khiếu nại (DL-10: ComplaintReport.processing_status)
CREATE TYPE complaint_processing_status AS ENUM (
    'pending',
    'processing',
    'resolved'
);

-- Phân loại yêu cầu xử lý từ trợ lý AI (DL-11: AIChatSession.support_type)
CREATE TYPE ai_support_type AS ENUM (
    'chatbot',
    'term_explanation',
    'fit_analysis',
    'job_suggestion',
    'cv_scoring'
);


--------------------------------------------------------------------------------
-- 2. CREATE TABLES
--------------------------------------------------------------------------------

-- DL-01: Account
-- Lưu thông tin đăng nhập, vai trò của mỗi người dùng & refresh token revocation fields
CREATE TABLE account (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone_number VARCHAR(15) UNIQUE NULL,
    password VARCHAR(255) NOT NULL,
    role account_role NOT NULL,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    refresh_token_hash TEXT NULL,
    refresh_token_expires_at TIMESTAMPTZ NULL,
    created_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- DL-02: CandidateProfile
-- Lưu thông tin nền (học vấn, kỹ năng, kinh nghiệm) và điểm uy tín của ứng viên
CREATE TABLE candidate_profile (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id INT NOT NULL UNIQUE REFERENCES account(id) ON DELETE RESTRICT,
    full_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(255) NULL,
    education TEXT NULL,
    skills TEXT NULL,
    experience TEXT NULL,
    trust_score DECIMAL(3,2) NOT NULL DEFAULT 5.00
);

-- DL-03: CVVersion
-- Đại diện cho một phiên bản CV cụ thể gắn với định hướng nghề nghiệp
CREATE TABLE cv_version (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id INT NOT NULL REFERENCES candidate_profile(id) ON DELETE RESTRICT,
    cv_name VARCHAR(100) NOT NULL,
    career_orientation VARCHAR(100) NOT NULL,
    cv_content JSONB NULL,
    attachment_file VARCHAR(255) NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    updated_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- DL-04: Employer
-- Lưu thông tin và trạng thái xác minh của nhà tuyển dụng
CREATE TABLE employer (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id INT NOT NULL UNIQUE REFERENCES account(id) ON DELETE RESTRICT,
    company_name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NULL,
    avatar_url VARCHAR(255) NULL,
    verification_status verification_status NOT NULL DEFAULT 'unverified',
    verification_document VARCHAR(255) NULL,
    trust_score DECIMAL(3,2) NOT NULL DEFAULT 5.00
);

-- DL-05: JobPosting
-- Bảng gốc cho tin tuyển dụng thông thường hoặc Small Job
CREATE TABLE job_posting (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employer_id INT NOT NULL REFERENCES employer(id) ON DELETE RESTRICT,
    title VARCHAR(150) NOT NULL,
    job_description TEXT NOT NULL,
    requirements TEXT NOT NULL,
    salary VARCHAR(100) NOT NULL,
    location VARCHAR(255) NOT NULL,
    job_type job_type NOT NULL,
    approval_status approval_status NOT NULL DEFAULT 'pending',
    posted_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- DL-06: SmallJobPosting
-- Bảng mở rộng 1-1 của JobPosting (chỉ khi job_type = 'small_job')
CREATE TABLE small_job_posting (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_posting_id INT NOT NULL UNIQUE REFERENCES job_posting(id) ON DELETE CASCADE,
    working_hours VARCHAR(50) NOT NULL,
    number_of_days INT NOT NULL,
    positions_needed INT NOT NULL,
    start_time DATE NOT NULL
);

-- DL-07: SmallJobRegistration
-- Ghi nhận tài khoản đăng ký tham gia một tin Small Job cụ thể
CREATE TABLE small_job_registration (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    small_job_posting_id INT NOT NULL REFERENCES small_job_posting(id) ON DELETE CASCADE,
    account_id INT NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    status small_job_registration_status NOT NULL DEFAULT 'registered',
    registration_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_small_job_registration_user UNIQUE (small_job_posting_id, account_id)
);

-- DL-08: JobApplication
-- Liên kết một bản CV với một tin tuyển dụng
CREATE TABLE job_application (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cv_version_id INT NOT NULL REFERENCES cv_version(id) ON DELETE RESTRICT,
    job_posting_id INT NOT NULL REFERENCES job_posting(id) ON DELETE RESTRICT,
    status job_application_status NOT NULL DEFAULT 'submitted',
    application_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status_updated_date TIMESTAMPTZ NULL,
    CONSTRAINT uq_job_application_cv_job UNIQUE (cv_version_id, job_posting_id)
);

-- DL-09: Review
-- Lưu điểm và nhận xét đánh giá lẫn nhau sau khi hoàn thành Small Job
CREATE TABLE review (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    small_job_registration_id INT NOT NULL REFERENCES small_job_registration(id) ON DELETE RESTRICT,
    reviewer_id INT NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    reviewee_id INT NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    score SMALLINT NOT NULL CHECK (score >= 1 AND score <= 5),
    comment TEXT NULL,
    is_disputed BOOLEAN NOT NULL DEFAULT FALSE,
    review_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- DL-10: ComplaintReport
-- Ghi nhận và theo dõi quá trình xử lý báo cáo / khiếu nại về một đánh giá
CREATE TABLE complaint_report (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sender_id INT NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    review_id INT NULL REFERENCES review(id) ON DELETE SET NULL,
    report_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    processing_status complaint_processing_status NOT NULL DEFAULT 'pending',
    admin_conclusion TEXT NULL,
    sent_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_date TIMESTAMPTZ NULL
);

-- DL-11: AIChatSession
-- Lưu lịch sử trao đổi giữa người dùng và trợ lý AI
CREATE TABLE ai_chat_session (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id INT NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    question TEXT NOT NULL,
    support_type ai_support_type NOT NULL,
    analysis_result JSONB NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Notification (Nhóm API 4.8 / 4.9 Thông báo hệ thống)
CREATE TABLE notification (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id INT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


--------------------------------------------------------------------------------
-- 3. CREATE INDEXES
--------------------------------------------------------------------------------

-- Indexes cho Khóa ngoại (Foreign Keys)
CREATE INDEX idx_cv_version_profile_id ON cv_version(profile_id);
CREATE INDEX idx_job_posting_employer_id ON job_posting(employer_id);
CREATE INDEX idx_small_job_registration_posting_id ON small_job_registration(small_job_posting_id);
CREATE INDEX idx_small_job_registration_account_id ON small_job_registration(account_id);
CREATE INDEX idx_job_application_cv_version_id ON job_application(cv_version_id);
CREATE INDEX idx_job_application_job_posting_id ON job_application(job_posting_id);
CREATE INDEX idx_review_registration_id ON review(small_job_registration_id);
CREATE INDEX idx_review_reviewer_id ON review(reviewer_id);
CREATE INDEX idx_review_reviewee_id ON review(reviewee_id);
CREATE INDEX idx_complaint_report_sender_id ON complaint_report(sender_id);
CREATE INDEX idx_complaint_report_review_id ON complaint_report(review_id);
CREATE INDEX idx_ai_chat_session_account_id ON ai_chat_session(account_id);
CREATE INDEX idx_notification_account_id ON notification(account_id);

-- Indexes tối ưu hóa truy vấn lọc / tìm kiếm theo mô tả thiết kế (Mục 3.3)
CREATE INDEX idx_job_posting_type_approval ON job_posting(job_type, approval_status);
CREATE INDEX idx_job_application_status ON job_application(status);

COMMIT;

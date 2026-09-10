-- ============================================================================
-- Migration: 009_province_and_industry_tags.sql
-- Description: Tạo bảng 34 Tỉnh/Thành phố mới (hiệu lực 1/7/2025), bảng Ngành nghề / Tags và liên kết JobPosting
-- ============================================================================

-- 1. Tạo bảng Province (34 Tỉnh/Thành phố mới của Việt Nam)
CREATE TABLE IF NOT EXISTS province (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('tinh', 'thanh_pho')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed đúng 34 bản ghi Tỉnh/Thành phố (6 Thành phố, 28 Tỉnh)
INSERT INTO province (name, type) VALUES
    -- 6 Thành phố trực thuộc Trung ương
    ('Hà Nội', 'thanh_pho'),
    ('Hải Phòng', 'thanh_pho'),
    ('Đà Nẵng', 'thanh_pho'),
    ('Huế', 'thanh_pho'),
    ('TP. Hồ Chí Minh', 'thanh_pho'),
    ('Cần Thơ', 'thanh_pho'),
    -- 28 Tỉnh
    ('Lai Châu', 'tinh'),
    ('Điện Biên', 'tinh'),
    ('Sơn La', 'tinh'),
    ('Lạng Sơn', 'tinh'),
    ('Quảng Ninh', 'tinh'),
    ('Thanh Hóa', 'tinh'),
    ('Nghệ An', 'tinh'),
    ('Hà Tĩnh', 'tinh'),
    ('Cao Bằng', 'tinh'),
    ('Tuyên Quang', 'tinh'),
    ('Lào Cai', 'tinh'),
    ('Thái Nguyên', 'tinh'),
    ('Phú Thọ', 'tinh'),
    ('Bắc Ninh', 'tinh'),
    ('Hưng Yên', 'tinh'),
    ('Ninh Bình', 'tinh'),
    ('Quảng Trị', 'tinh'),
    ('Quảng Ngãi', 'tinh'),
    ('Gia Lai', 'tinh'),
    ('Khánh Hòa', 'tinh'),
    ('Lâm Đồng', 'tinh'),
    ('Đắk Lắk', 'tinh'),
    ('Đồng Nai', 'tinh'),
    ('Tây Ninh', 'tinh'),
    ('Vĩnh Long', 'tinh'),
    ('Đồng Tháp', 'tinh'),
    ('Cà Mau', 'tinh'),
    ('An Giang', 'tinh')
ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type;

-- 2. Tạo bảng Industry (Danh mục Ngành nghề & Tags)
CREATE TABLE IF NOT EXISTS industry (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    icon VARCHAR(50) NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO industry (name, slug, icon) VALUES
    ('Công nghệ thông tin', 'cong-nghe-thong-tin', 'Code'),
    ('Bán hàng / Kinh doanh', 'ban-hang-kinh-doanh', 'TrendingUp'),
    ('Marketing / Truyền thông', 'marketing-truyen-thong', 'Megaphone'),
    ('Nhà hàng / Khách sạn / Phục vụ', 'nha-hang-khach-san', 'Utensils'),
    ('Thiết kế / Đồ họa', 'thiet-ke-do-hoa', 'Palette'),
    ('Kế toán / Tài chính / Ngân hàng', 'ke-toan-tai-chinh', 'Calculator'),
    ('Giao hàng / Kho vận / Logistics', 'giao-hang-logistics', 'Truck'),
    ('Hành chính / Nhân sự', 'hanh-chinh-nhan-su', 'Users'),
    ('Chăm sóc khách hàng / Telesales', 'cskh-telesales', 'Headphones'),
    ('Giáo dục / Đào tạo', 'giao-duc-dao-tao', 'GraduationCap'),
    ('Cơ khí / Kỹ thuật / Sản xuất', 'co-khi-ky-thuat', 'Wrench'),
    ('Y tế / Dược phẩm', 'y-te-duoc-pham', 'HeartPulse'),
    ('Bất động sản / Xây dựng', 'bat-dong-san-xay-dung', 'Building'),
    ('Lao động phổ thông / Bán thời gian', 'lao-dong-pho-thong', 'Briefcase')
ON CONFLICT (name) DO NOTHING;

-- 3. Bổ sung cột province_id và tags vào bảng job_posting
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'job_posting' AND column_name = 'province_id'
    ) THEN
        ALTER TABLE job_posting ADD COLUMN province_id INT NULL REFERENCES province(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'job_posting' AND column_name = 'tags'
    ) THEN
        ALTER TABLE job_posting ADD COLUMN tags TEXT[] DEFAULT '{}';
    END IF;
END $$;

-- 4. Tạo bảng trung gian job_industry (Hỗ trợ 1 tin gắn nhiều ngành nghề)
CREATE TABLE IF NOT EXISTS job_industry (
    job_posting_id INT NOT NULL REFERENCES job_posting(id) ON DELETE CASCADE,
    industry_id INT NOT NULL REFERENCES industry(id) ON DELETE CASCADE,
    PRIMARY KEY (job_posting_id, industry_id)
);

-- 5. Tạo Indexes
CREATE INDEX IF NOT EXISTS idx_job_posting_province_id ON job_posting(province_id);
CREATE INDEX IF NOT EXISTS idx_job_industry_job_id ON job_industry(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_job_industry_industry_id ON job_industry(industry_id);
CREATE INDEX IF NOT EXISTS idx_province_type ON province(type);

-- 6. Tự động ánh xạ và cập nhật province_id & industry cho các tin đăng hiện có
-- Ánh xạ province theo text location hoặc gán mặc định có trọng số
UPDATE job_posting 
SET province_id = (SELECT id FROM province WHERE name = 'Hà Nội')
WHERE province_id IS NULL AND (location ILIKE '%Hà Nội%' OR location ILIKE '%Ha Noi%');

UPDATE job_posting 
SET province_id = (SELECT id FROM province WHERE name = 'TP. Hồ Chí Minh')
WHERE province_id IS NULL AND (location ILIKE '%Hồ Chí Minh%' OR location ILIKE '%HCM%' OR location ILIKE '%Sài Gòn%');

UPDATE job_posting 
SET province_id = (SELECT id FROM province WHERE name = 'Đà Nẵng')
WHERE province_id IS NULL AND (location ILIKE '%Đà Nẵng%' OR location ILIKE '%Da Nang%');

UPDATE job_posting 
SET province_id = (SELECT id FROM province WHERE name = 'Hải Phòng')
WHERE province_id IS NULL AND (location ILIKE '%Hải Phòng%');

UPDATE job_posting 
SET province_id = (SELECT id FROM province WHERE name = 'Cần Thơ')
WHERE province_id IS NULL AND (location ILIKE '%Cần Thơ%');

-- Gán ngẫu nhiên hợp lý có trọng số cho các tin còn lại
UPDATE job_posting
SET province_id = CASE (id % 10)
    WHEN 0 THEN (SELECT id FROM province WHERE name = 'TP. Hồ Chí Minh')
    WHEN 1 THEN (SELECT id FROM province WHERE name = 'Hà Nội')
    WHEN 2 THEN (SELECT id FROM province WHERE name = 'Đà Nẵng')
    WHEN 3 THEN (SELECT id FROM province WHERE name = 'TP. Hồ Chí Minh')
    WHEN 4 THEN (SELECT id FROM province WHERE name = 'Hà Nội')
    WHEN 5 THEN (SELECT id FROM province WHERE name = 'Hải Phòng')
    WHEN 6 THEN (SELECT id FROM province WHERE name = 'Cần Thơ')
    WHEN 7 THEN (SELECT id FROM province WHERE name = 'Bắc Ninh')
    WHEN 8 THEN (SELECT id FROM province WHERE name = 'Đồng Nai')
    ELSE (SELECT id FROM province WHERE name = 'Khánh Hòa')
END
WHERE province_id IS NULL;

-- Ánh xạ ngành nghề dựa theo title / description cho các tin hiện có
INSERT INTO job_industry (job_posting_id, industry_id)
SELECT jp.id, ind.id
FROM job_posting jp, industry ind
WHERE ind.slug = 'cong-nghe-thong-tin'
  AND (jp.title ILIKE '%developer%' OR jp.title ILIKE '%lập trình%' OR jp.title ILIKE '%software%' OR jp.title ILIKE '%frontend%' OR jp.title ILIKE '%backend%' OR jp.title ILIKE '%it%' OR jp.title ILIKE '%react%' OR jp.title ILIKE '%node%' OR jp.title ILIKE '%dev%')
ON CONFLICT DO NOTHING;

INSERT INTO job_industry (job_posting_id, industry_id)
SELECT jp.id, ind.id
FROM job_posting jp, industry ind
WHERE ind.slug = 'nha-hang-khach-san'
  AND (jp.title ILIKE '%phục vụ%' OR jp.title ILIKE '%pha chế%' OR jp.title ILIKE '%barista%' OR jp.title ILIKE '%bếp%' OR jp.title ILIKE '%nhà hàng%' OR jp.title ILIKE '%khách sạn%' OR jp.job_type = 'small_job')
ON CONFLICT DO NOTHING;

INSERT INTO job_industry (job_posting_id, industry_id)
SELECT jp.id, ind.id
FROM job_posting jp, industry ind
WHERE ind.slug = 'ban-hang-kinh-doanh'
  AND (jp.title ILIKE '%bán hàng%' OR jp.title ILIKE '%sales%' OR jp.title ILIKE '%kinh doanh%' OR jp.title ILIKE '%thu ngân%')
ON CONFLICT DO NOTHING;

INSERT INTO job_industry (job_posting_id, industry_id)
SELECT jp.id, ind.id
FROM job_posting jp, industry ind
WHERE ind.slug = 'marketing-truyen-thong'
  AND (jp.title ILIKE '%marketing%' OR jp.title ILIKE '%seo%' OR jp.title ILIKE '%content%' OR jp.title ILIKE '%truyền thông%')
ON CONFLICT DO NOTHING;

INSERT INTO job_industry (job_posting_id, industry_id)
SELECT jp.id, ind.id
FROM job_posting jp, industry ind
WHERE ind.slug = 'thiet-ke-do-hoa'
  AND (jp.title ILIKE '%thiết kế%' OR jp.title ILIKE '%design%' OR jp.title ILIKE '%ui/ux%' OR jp.title ILIKE '%đồ họa%')
ON CONFLICT DO NOTHING;

INSERT INTO job_industry (job_posting_id, industry_id)
SELECT jp.id, ind.id
FROM job_posting jp, industry ind
WHERE ind.slug = 'giao-hang-logistics'
  AND (jp.title ILIKE '%giao hàng%' OR jp.title ILIKE '%kho%' OR jp.title ILIKE '%shipper%' OR jp.title ILIKE '%vận chuyển%')
ON CONFLICT DO NOTHING;

-- Đảm bảo mọi tin đều có ít nhất 1 ngành nghề
INSERT INTO job_industry (job_posting_id, industry_id)
SELECT jp.id, (SELECT id FROM industry WHERE slug = 'lao-dong-pho-thong')
FROM job_posting jp
WHERE NOT EXISTS (SELECT 1 FROM job_industry ji WHERE ji.job_posting_id = jp.id)
ON CONFLICT DO NOTHING;

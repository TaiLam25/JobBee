const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../src/config/db');

function parseSalary(str) {
    if (!str || typeof str !== 'string') {
        return { is_negotiable: true, salary_min: null, salary_max: null };
    }

    const trimmed = str.trim();
    const lower = trimmed.toLowerCase();

    // 1. Thỏa thuận
    if (lower.includes('thỏa thuận') || lower.includes('thoả thuận') || lower.includes('deal')) {
        return { is_negotiable: true, salary_min: null, salary_max: null };
    }

    // 2. USD format: "$1,200 - $2,500" or "$2,000 - $3,500"
    const usdRangeMatch = lower.match(/\$([0-9,.]+)\s*-\s*\$([0-9,.]+)/);
    if (usdRangeMatch) {
        const minUsd = parseFloat(usdRangeMatch[1].replace(/,/g, ''));
        const maxUsd = parseFloat(usdRangeMatch[2].replace(/,/g, ''));
        return {
            is_negotiable: false,
            salary_min: Math.round(minUsd * 25000),
            salary_max: Math.round(maxUsd * 25000),
        };
    }

    // 3. Million range: "10 - 16 triệu", "10-20 triệu", "15 - 35 triệu VNĐ (Lương + Hoa hồng)", "25 - 35 triệu/tháng"
    const millionRangeMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:-|–|đến)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:tr|triệu)/);
    if (millionRangeMatch) {
        const minVal = Math.round(parseFloat(millionRangeMatch[1]) * 1000000);
        const maxVal = Math.round(parseFloat(millionRangeMatch[2]) * 1000000);
        return {
            is_negotiable: false,
            salary_min: Math.min(minVal, maxVal),
            salary_max: Math.max(minVal, maxVal),
        };
    }

    // 4. Single million with "tr" / "triệu": "10TR", "14tr", "15 triệu"
    const singleMillionMatch = lower.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:tr|triệu)/);
    if (singleMillionMatch) {
        const val = Math.round(parseFloat(singleMillionMatch[1]) * 1000000);
        return {
            is_negotiable: false,
            salary_min: val,
            salary_max: val,
        };
    }

    // 5. Full standard dotted VNĐ: e.g. "12.000.000", "1.200.000 VNĐ", "120.000 VNĐ / ca", "300.000 VNĐ"
    const dottedMatch = trimmed.match(/([0-9]{1,3}(?:\.[0-9]{3})+)/);
    if (dottedMatch) {
        const val = parseInt(dottedMatch[1].replace(/\./g, ''), 10);
        return {
            is_negotiable: false,
            salary_min: val,
            salary_max: val,
        };
    }

    // 6. Plain integers: e.g. "20000", "21" (if <= 100, treated as million)
    const plainIntMatch = trimmed.match(/^([0-9]+)$/);
    if (plainIntMatch) {
        const num = parseInt(plainIntMatch[1], 10);
        const val = num <= 100 ? num * 1000000 : num;
        return {
            is_negotiable: false,
            salary_min: val,
            salary_max: val,
        };
    }

    // Unparseable
    return null;
}

async function migrate() {
    try {
        console.log('--- BẮT ĐẦU MIGRATION CẤU TRÚC LƯƠNG ---');

        // 1. Chạy migration 010 để thêm cột
        const migrationSql = fs.readFileSync(path.join(__dirname, '../migrations/010_structured_salary.sql'), 'utf8');
        await db.query(migrationSql);
        console.log('✓ Migration 010_structured_salary.sql áp dụng thành công (đã tạo các cột mới).');

        // Kiểm tra xem cột salary cũ có tồn tại không
        const colCheck = await db.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'job_posting' AND column_name = 'salary'
        `);

        if (colCheck.rows.length === 0) {
            console.log('Cột salary cũ đã được xoá từ trước. Bỏ qua bước parse.');
            process.exit(0);
        }

        // 2. Lấy toàn bộ bản ghi cần migrate
        const jobsRes = await db.query('SELECT id, salary FROM job_posting');
        console.log(`Tìm thấy ${jobsRes.rows.length} tin tuyển dụng cần kiểm tra và chuyển đổi.`);

        const unparsed = [];
        let parsedCount = 0;
        let negotiableCount = 0;
        let numericCount = 0;

        for (const job of jobsRes.rows) {
            const parsed = parseSalary(job.salary);
            if (!parsed) {
                unparsed.push({ id: job.id, rawSalary: job.salary });
            } else {
                parsedCount++;
                if (parsed.is_negotiable) negotiableCount++;
                else numericCount++;

                await db.query(
                    `UPDATE job_posting 
                     SET salary_min = $1, salary_max = $2, is_negotiable = $3 
                     WHERE id = $4`,
                    [parsed.salary_min, parsed.salary_max, parsed.is_negotiable, job.id]
                );
            }
        }

        console.log('\n--- KẾT QUẢ PARSE & CẬP NHẬT ---');
        console.log(`✓ Tổng tin parse thành công: ${parsedCount}/${jobsRes.rows.length}`);
        console.log(`  - Tin Thỏa thuận (is_negotiable = true): ${negotiableCount}`);
        console.log(`  - Tin có khoảng lương (is_negotiable = false): ${numericCount}`);

        if (unparsed.length > 0) {
            console.warn(`\n⚠️ CẢNH BÁO: Có ${unparsed.length} tin KHÔNG PARSE ĐƯỢC:`);
            console.warn(JSON.stringify(unparsed, null, 2));
            console.error('Dừng lại để kiểm tra thủ công, CHƯA XOÁ cột salary cũ.');
            process.exit(1);
        }

        console.log('\n✓ 100% dữ liệu đã được phân tích và lưu vào các cột mới chính xác!');

        // 3. Tiến hành XOÁ cột salary cũ
        console.log('\nTiến hành xoá cột salary (VARCHAR) cũ...');
        await db.query('ALTER TABLE job_posting DROP COLUMN IF EXISTS salary;');
        console.log('✓ ĐÃ XOÁ cột salary cũ thành công. 3 cột mới (salary_min, salary_max, is_negotiable) là nguồn duy nhất!');

        // 4. In mẫu 5 bản ghi sau khi migrate
        const sample = await db.query('SELECT id, title, salary_min, salary_max, is_negotiable FROM job_posting LIMIT 5');
        console.log('\nMẫu dữ liệu sau khi hoàn thành:');
        console.log(JSON.stringify(sample.rows, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Lỗi khi thực hiện migration:', err);
        process.exit(1);
    }
}

migrate();

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { pool } = require('../src/config/db');

const runMigration = async () => {
    console.log('\n==================================================');
    console.log('🚀 KHỞI CHẠY SQL MIGRATION CHO POSTGRESQL/SUPABASE');
    console.log('==================================================\n');

    const dbUrl = process.env.DATABASE_URL || '';

    if (!dbUrl || dbUrl.includes('your_password_here')) {
        console.error('❌ LỖI: Chưa cấu hình mật khẩu DATABASE_URL trong file .env!');
        console.log('\n📌 HƯỚNG DẪN XỬ LÝ:');
        console.log('1. Mở file backend/.env');
        console.log('2. Thay thế `your_password_here` bằng MẬT KHẨU THỰC TẾ của dự án Supabase.');
        console.log('3. Hoặc mở Supabase Web Dashboard -> SQL Editor -> Dán nội dung file backend/migrations/001_initial_schema.sql và nhấn Run.\n');
        process.exit(1);
    }

    try {
        const client = await pool.connect();
        const migrationsDir = path.join(__dirname, '../migrations');
        const targetFile = process.argv[2];

        let filesToRun = [];
        if (targetFile) {
            const sqlPath = path.isAbsolute(targetFile) 
                ? targetFile 
                : path.join(migrationsDir, targetFile.replace(/^migrations[\\/]/, ''));
            filesToRun.push(sqlPath);
        } else {
            const allFiles = fs.readdirSync(migrationsDir)
                .filter(f => f.endsWith('.sql'))
                .sort();
            filesToRun = allFiles.map(f => path.join(migrationsDir, f));
        }

        console.log(`📋 Tổng số file migration cần thực thi: ${filesToRun.length}\n`);

        for (const sqlPath of filesToRun) {
            console.log(`📂 Đang thực thi migration: ${path.basename(sqlPath)}...`);
            const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
            await client.query(sqlContent);
            console.log(`  ✅ Hoàn tất: ${path.basename(sqlPath)}`);
        }

        client.release();
        console.log('\n✨ TOÀN BỘ MIGRATION ĐÃ ĐƯỢC THỰC THI THÀNH CÔNG!\n');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ LỖI THỰC THI MIGRATION:');
        console.error(error.message || error);
        process.exit(1);
    }
};

runMigration();

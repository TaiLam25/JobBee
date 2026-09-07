const adminService = require('./admin.service');
const db = require('../../config/db');
const { logger } = require('../../config/logger');

let autoApproveTimer = null;
const itemDelays = new Map(); // key: 'emp_${id}' or 'job_${id}', value: timestamp when it can be approved

// Generate random delay between 5 and 20 seconds (in milliseconds)
const getRandomDelayMs = () => Math.floor(Math.random() * (20000 - 5000 + 1)) + 5000;

/**
 * Executes one scanning and auto-approval cycle
 */
const runAutoApproveCycle = async () => {
    const isEnabled = process.env.AUTO_APPROVE_DEMO === 'true' || process.env.AUTO_APPROVE_DEMO === '1';
    if (!isEnabled) return;

    try {
        const now = Date.now();

        // 1. Lookup seeded Admin account
        const adminRes = await db.query(
            "SELECT id, email FROM account WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
        );
        const admin = adminRes.rows[0] || { id: 1, email: 'admin@test.com' };

        // 2. Scan pending Employers
        const pendingEmployers = await db.query(
            "SELECT id, company_name, verification_status FROM employer WHERE verification_status = 'pending' ORDER BY id ASC LIMIT 100"
        );

        for (const emp of pendingEmployers.rows) {
            const key = `emp_${emp.id}`;
            if (!itemDelays.has(key)) {
                const delay = getRandomDelayMs();
                itemDelays.set(key, now + delay);
                const logMsg = `[AUTO-APPROVE DEMO] Phát hiện Doanh nghiệp #${emp.id} ("${emp.company_name}") đang chờ duyệt. Sẽ tự động duyệt sau ${Math.round(delay / 1000)}s.`;
                console.log(logMsg);
                logger.info(logMsg);
            } else if (now >= itemDelays.get(key)) {
                itemDelays.delete(key);
                try {
                    await adminService.verifyEmployer(emp.id, { status: 'verified' });
                    const logMsg = `[AUTO-APPROVE DEMO] Đã duyệt Employer #${emp.id} ("${emp.company_name}") thành công bởi Admin #${admin.id} (${admin.email}).`;
                    console.log(logMsg);
                    logger.info(logMsg);
                } catch (verifyErr) {
                    const errMsg = `[AUTO-APPROVE DEMO] Lỗi khi duyệt Employer #${emp.id}: ${verifyErr.message}`;
                    console.error(errMsg);
                    logger.error(errMsg);
                }
            }
        }

        // 3. Scan pending Full-time Jobs (EXCLUDE small_job which is auto-approved)
        const pendingJobs = await db.query(
            "SELECT jp.id, jp.title, jp.job_type, jp.approval_status, e.company_name FROM job_posting jp JOIN employer e ON jp.employer_id = e.id WHERE jp.approval_status = 'pending' AND jp.job_type = 'full_time' ORDER BY jp.id ASC LIMIT 100"
        );

        for (const job of pendingJobs.rows) {
            const key = `job_${job.id}`;
            if (!itemDelays.has(key)) {
                const delay = getRandomDelayMs();
                itemDelays.set(key, now + delay);
                const logMsg = `[AUTO-APPROVE DEMO] Phát hiện Tin tuyển dụng #${job.id} ("${job.title}") của "${job.company_name}" đang chờ duyệt. Sẽ tự động duyệt sau ${Math.round(delay / 1000)}s.`;
                console.log(logMsg);
                logger.info(logMsg);
            } else if (now >= itemDelays.get(key)) {
                itemDelays.delete(key);
                try {
                    await adminService.moderateJob(job.id, { status: 'approved' });
                    const logMsg = `[AUTO-APPROVE DEMO] Đã duyệt Tin tuyển dụng #${job.id} ("${job.title}") của "${job.company_name}" thành công bởi Admin #${admin.id} (${admin.email}).`;
                    console.log(logMsg);
                    logger.info(logMsg);
                } catch (jobErr) {
                    const errMsg = `[AUTO-APPROVE DEMO] Lỗi khi duyệt Tin tuyển dụng #${job.id}: ${jobErr.message}`;
                    console.error(errMsg);
                    logger.error(errMsg);
                }
            }
        }

        // Cleanup stale keys
        const currentEmpIds = new Set(pendingEmployers.rows.map(e => `emp_${e.id}`));
        const currentJobIds = new Set(pendingJobs.rows.map(j => `job_${j.id}`));
        for (const key of itemDelays.keys()) {
            if (!currentEmpIds.has(key) && !currentJobIds.has(key)) {
                itemDelays.delete(key);
            }
        }

    } catch (err) {
        logger.error(`[AUTO-APPROVE DEMO] Lỗi trong chu kỳ auto-approve: ${err.message}`);
    }
};

/**
 * Start periodic auto-approve background worker
 */
const startAutoApproveJob = (intervalMs = 10000) => {
    const isEnabled = process.env.AUTO_APPROVE_DEMO === 'true' || process.env.AUTO_APPROVE_DEMO === '1';
    if (isEnabled) {
        const msg = `[AUTO-APPROVE DEMO] Đã kích hoạt chế độ Demo Auto-Approve (chu kỳ quét: ${intervalMs / 1000}s, độ trễ mô phỏng: 5-20s).`;
        console.log(msg);
        logger.info(msg);
        if (!autoApproveTimer) {
            autoApproveTimer = setInterval(runAutoApproveCycle, intervalMs);
            setTimeout(runAutoApproveCycle, 2000);
        }
    } else {
        const msg = '[AUTO-APPROVE DEMO] Chế độ Auto-Approve Demo đang TẮT (AUTO_APPROVE_DEMO=false). Hệ thống yêu cầu Admin duyệt thủ công.';
        console.log(msg);
        logger.info(msg);
    }
};

/**
 * Stop auto-approve background worker
 */
const stopAutoApproveJob = () => {
    if (autoApproveTimer) {
        clearInterval(autoApproveTimer);
        autoApproveTimer = null;
        logger.info('[AUTO-APPROVE DEMO] Đã dừng background job Auto-Approve.');
    }
};

module.exports = {
    startAutoApproveJob,
    stopAutoApproveJob,
    runAutoApproveCycle,
};

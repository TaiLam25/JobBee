const db = require('../../config/db');

const getProfileByAccountId = async (accountId) => {
    const result = await db.query(
        'SELECT * FROM candidate_profile WHERE account_id = $1',
        [accountId]
    );
    return result.rows[0];
};

const updateProfile = async (accountId, { full_name, avatar_url, education, skills, experience }) => {
    const result = await db.query(
        `UPDATE candidate_profile 
         SET full_name = COALESCE($1, full_name),
             avatar_url = COALESCE($2, avatar_url),
             education = COALESCE($3, education),
             skills = COALESCE($4, skills),
             experience = COALESCE($5, experience)
         WHERE account_id = $6
         RETURNING *`,
        [full_name, avatar_url, education, skills, experience, accountId]
    );
    return result.rows[0];
};

const getCVsByProfileId = async (profileId) => {
    const result = await db.query(
        'SELECT * FROM cv_version WHERE profile_id = $1 ORDER BY updated_date DESC',
        [profileId]
    );
    return result.rows;
};

const getCVById = async (id, profileId) => {
    const result = await db.query(
        'SELECT * FROM cv_version WHERE id = $1 AND profile_id = $2',
        [id, profileId]
    );
    return result.rows[0];
};

const createCV = async (profileId, { cv_name, career_orientation, cv_content, attachment_file, is_default }) => {
    if (is_default) {
        await db.query('UPDATE cv_version SET is_default = FALSE WHERE profile_id = $1', [profileId]);
    }

    const result = await db.query(
        `INSERT INTO cv_version (profile_id, cv_name, career_orientation, cv_content, attachment_file, is_default)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [profileId, cv_name, career_orientation, cv_content ? JSON.stringify(cv_content) : null, attachment_file || null, is_default || false]
    );
    return result.rows[0];
};

const updateCV = async (id, profileId, { cv_name, career_orientation, cv_content, attachment_file, is_default }) => {
    if (is_default) {
        await db.query('UPDATE cv_version SET is_default = FALSE WHERE profile_id = $1', [profileId]);
    }

    const result = await db.query(
        `UPDATE cv_version 
         SET cv_name = COALESCE($1, cv_name),
             career_orientation = COALESCE($2, career_orientation),
             cv_content = COALESCE($3, cv_content),
             attachment_file = COALESCE($4, attachment_file),
             is_default = COALESCE($5, is_default),
             updated_date = CURRENT_TIMESTAMP
         WHERE id = $6 AND profile_id = $7
         RETURNING *`,
        [cv_name, career_orientation, cv_content ? JSON.stringify(cv_content) : null, attachment_file, is_default, id, profileId]
    );
    return result.rows[0];
};

const deleteCV = async (id, profileId) => {
    await db.query('DELETE FROM cv_version WHERE id = $1 AND profile_id = $2', [id, profileId]);
};

const setDefaultCV = async (id, profileId) => {
    await db.query('UPDATE cv_version SET is_default = FALSE WHERE profile_id = $1', [profileId]);
    const result = await db.query(
        'UPDATE cv_version SET is_default = TRUE WHERE id = $1 AND profile_id = $2 RETURNING *',
        [id, profileId]
    );
    return result.rows[0];
};

const getCVVersions = async (accountId) => {
    const profile = await getProfileByAccountId(accountId);
    if (!profile) return [];
    return await getCVsByProfileId(profile.id);
};

const getCVVersionById = async (accountId, cvId) => {
    const profile = await getProfileByAccountId(accountId);
    if (!profile) return null;
    return await getCVById(cvId, profile.id);
};

module.exports = {
    getProfileByAccountId,
    updateProfile,
    getCVsByProfileId,
    getCVById,
    getCVVersions,
    getCVVersionById,
    createCV,
    updateCV,
    deleteCV,
    setDefaultCV,
};

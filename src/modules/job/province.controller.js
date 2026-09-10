const db = require('../../config/db');
const { sendResponse } = require('../../utils/response');

const getProvinces = async (req, res, next) => {
    try {
        const { type } = req.query;
        let queryStr = 'SELECT id, name, type FROM province';
        const params = [];

        if (type && ['tinh', 'thanh_pho'].includes(type)) {
            params.push(type);
            queryStr += ' WHERE type = $1';
        }

        queryStr += ' ORDER BY CASE WHEN type = \'thanh_pho\' THEN 0 ELSE 1 END, name ASC';

        const result = await db.query(queryStr, params);
        return sendResponse(res, 200, 'Lấy danh sách tỉnh/thành phố thành công', result.rows);
    } catch (error) {
        next(error);
    }
};

const getIndustries = async (req, res, next) => {
    try {
        const queryStr = 'SELECT id, name, slug, icon FROM industry ORDER BY id ASC';
        const result = await db.query(queryStr);
        return sendResponse(res, 200, 'Lấy danh sách ngành nghề thành công', result.rows);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getProvinces,
    getIndustries,
};

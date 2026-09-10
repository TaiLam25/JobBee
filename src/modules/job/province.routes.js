const express = require('express');
const provinceController = require('./province.controller');

const router = express.Router();

router.get('/provinces', provinceController.getProvinces);
router.get('/industries', provinceController.getIndustries);

module.exports = router;

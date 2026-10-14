const { Router } = require('express');
const { getRoot } = require('../controllers/index.controller');

const router = Router();

router.get('/', getRoot);

module.exports = router;

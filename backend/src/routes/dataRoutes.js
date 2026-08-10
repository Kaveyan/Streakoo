const express = require("express");
const { getData, updateData } = require("../controllers/dataController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.get("/", getData);
router.put("/", updateData);

module.exports = router;

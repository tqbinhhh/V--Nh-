const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('../server/routes/api');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', apiRoutes);

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({ error: 'Lỗi server nội bộ', details: err.message });
});

module.exports = app;

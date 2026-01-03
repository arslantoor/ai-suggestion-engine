import express from 'express';
import { generateSuggestions } from './giminiApi.js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Middleware must come before routes
app.use(express.json());

// ✅ Optional: add this for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ✅ POST API endpoint
app.post('/api/generate', async (req, res) => {
  try {
    // ✅ Only log req.body
    console.log('Received body:', req.body);

    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Message is required in the request body'
      });
    }

    // ✅ Call your AI function
    const result = await generateSuggestions(message);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'AI Processing Error',
        message: result.message || result.error || 'AI Processing Error'
      });
    }

    // ✅ Send successful response
    res.status(200).json({
      success: true,
      message: 'Suggestions generated successfully',
      suggestions: result.suggestions,
      usageMetadatata: result.usageMetadata,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on: http://localhost:${PORT}`);
  console.log(`➡️  POST to: http://localhost:${PORT}/api/generate`);
});

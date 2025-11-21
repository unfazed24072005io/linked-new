const express = require('express');
const cors = require('cors');
const path = require('path');
const LinkedInService = require('./LinkedInService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active scraping sessions
const activeSessions = new Map();

// Routes
app.post('/api/login', async (req, res) => {
  try {
    const result = await LinkedInService.openBrowserForLogin();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ADD THIS GET ENDPOINT FOR SERVER-SENT EVENTS
app.get('/api/start-scraping', async (req, res) => {
  const { sessionId } = req.query;
  
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Session ID required' });
  }

  try {
    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Store the response for progress updates
    activeSessions.set(sessionId, res);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ status: 'connected', message: 'SSE connection established' })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      activeSessions.delete(sessionId);
      res.end();
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// KEEP THE POST ENDPOINT FOR STARTING SCRAPING
app.post('/api/start-scraping', async (req, res) => {
  const { filters, sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Session ID required' });
  }

  try {
    // Send starting progress
    sendProgress(sessionId, { status: 'starting', message: 'Initializing scraping...' });

    // Start scraping (run this asynchronously)
    LinkedInService.startScrapingAfterLogin(filters)
      .then(leads => {
        sendProgress(sessionId, { 
          status: 'completed', 
          message: `Scraping completed! Found ${leads.length} leads.`,
          data: leads 
        });
        activeSessions.delete(sessionId);
      })
      .catch(error => {
        sendProgress(sessionId, { 
          status: 'error', 
          message: `Scraping failed: ${error.message}` 
        });
        activeSessions.delete(sessionId);
      });

    // Immediately respond that scraping started
    res.json({ success: true, message: 'Scraping started' });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/stop-scraping', async (req, res) => {
  const { sessionId } = req.body;
  
  try {
    await LinkedInService.stopScraping();
    if (sessionId) {
      activeSessions.delete(sessionId);
    }
    res.json({ success: true, message: 'Scraping stopped' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/check-status', async (req, res) => {
  try {
    const isLoggedIn = LinkedInService.isLoggedIn;
    const isScrapingActive = LinkedInService.isScrapingActive;
    res.json({ isLoggedIn, isScrapingActive });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to send progress updates
function sendProgress(sessionId, data) {
  const res = activeSessions.get(sessionId);
  if (res) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('📋 LinkedIn Scraper Web App is ready!');
});
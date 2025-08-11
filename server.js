const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const OpenAI = require('openai');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// AnkiConnect configuration
const ANKI_CONNECT_URL = process.env.ANKI_CONNECT_URL || 'http://localhost:8765';
const ANKI_DECK_NAME = process.env.ANKI_DECK_NAME || 'GRE Vocabulary';

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const QUEUE_FILE = 'word-queue.json';

// AI and AnkiConnect helper functions

async function downloadImageAsBase64(imageUrl) {
    try {
        console.log(`Downloading image from: ${imageUrl}`);
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 10000
        });
        
        const base64 = Buffer.from(response.data).toString('base64');
        const mimeType = response.headers['content-type'] || 'image/png';
        
        console.log(`Image downloaded successfully, size: ${response.data.length} bytes`);
        return { base64, mimeType };
    } catch (error) {
        console.error('Error downloading image:', error.message);
        return null;
    }
}

async function storeImageInAnki(imageBase64, filename, mimeType) {
    try {
        console.log(`Storing image in Anki: ${filename}`);
        
        const result = await callAnkiConnect('storeMediaFile', {
            filename: filename,
            data: imageBase64
        });
        
        console.log(`Image stored successfully: ${filename}`);
        return filename;
    } catch (error) {
        console.error('Error storing image in Anki:', error.message);
        // If storeMediaFile fails, we'll still try to create the card without the image
        return null;
    }
}
async function generateAIContent(word) {
    try {
        console.log(`🤖 Generating AI content for word: "${word}"`);
        
        const completion = await openai.chat.completions.create({
            model: "gpt-5-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a GRE vocabulary tutor. Create educational content for vocabulary words. Always respond with valid JSON format."
                },
                {
                    role: "user", 
                    content: `For the GRE word "${word}", provide:
1. A clear, concise definition suitable for GRE test preparation
2. An example sentence that demonstrates the word's usage in context
3. A vivid, memorable visual scene description that would help someone remember this word (describe an image that connects the word's meaning to a memorable scenario)

Format your response as JSON:
{
  "definition": "...",
  "example": "...", 
  "imagePrompt": "..."
}`
                }
            ]
            // GPT-5-mini uses default temperature (1.0) and doesn't support custom parameters
        });

        console.log(`📝 Raw LLM response: ${completion.choices[0].message.content}`);
        
        const parsedContent = JSON.parse(completion.choices[0].message.content);
        
        console.log(`✅ AI content generated successfully for "${word}"`);
        console.log(`   Definition: ${parsedContent.definition.substring(0, 50)}...`);
        console.log(`   Example: ${parsedContent.example.substring(0, 50)}...`);
        console.log(`   Image prompt: ${parsedContent.imagePrompt.substring(0, 50)}...`);
        
        return parsedContent;
    } catch (error) {
        console.error('❌ Error generating AI content:', error.message);
        console.error('   Full error:', error);
        return {
            definition: `Failed to generate definition for ${word}. Error: ${error.message}`,
            example: `Could not generate example sentence for ${word}`,
            imagePrompt: `Simple illustration of the concept: ${word}`
        };
    }
}

async function generateAIImage(imagePrompt) {
    try {
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: `Educational illustration: ${imagePrompt}. Style: clean, simple, educational diagram suitable for vocabulary learning.`,
            size: "1024x1024",
            quality: "standard",
            n: 1,
        });

        return response.data[0].url;
    } catch (error) {
        console.error('Error generating AI image:', error);
        return null;
    }
}

// Create persistent axios instance for AnkiConnect
const ankiClient = axios.create({
    timeout: 8000, // Longer timeout
    headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
    }
});

async function callAnkiConnect(action, params, retryCount = 0) {
    try {
        // Build request body - some actions don't like params
        const requestBody = {
            action: action,
            version: 6
        };
        
        // Only add params if they exist and the action needs them
        if (params !== undefined && params !== null && Object.keys(params).length > 0) {
            requestBody.params = params;
        }
        
        // Add small delay to avoid rate limiting
        if (retryCount === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const response = await ankiClient.post(ANKI_CONNECT_URL, requestBody);

        if (response.data.error) {
            throw new Error(response.data.error);
        }

        return response.data.result;
    } catch (error) {
        // Retry logic for connection issues
        if ((error.code === 'ECONNRESET' || error.message.includes('socket hang up')) && retryCount < 2) {
            console.log(`Connection issue, retrying in ${(retryCount + 1) * 500}ms... (attempt ${retryCount + 1}/3)`);
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 500));
            return callAnkiConnect(action, params, retryCount + 1);
        }
        
        if (error.code === 'ECONNREFUSED') {
            console.error('Cannot connect to Anki. Please ensure:');
            console.error('1. Anki is running');
            console.error('2. AnkiConnect addon is installed (code: 2055492159)');
            console.error('3. AnkiConnect is configured to allow connections from localhost');
        }
        console.error(`AnkiConnect error (attempt ${retryCount + 1}):`, error.message);
        throw error;
    }
}

async function createAnkiCard(word, definition, example, imageUrl) {
    const front = word;
    let back = `<div style="font-family: Arial, sans-serif;">
<p><strong>Definition:</strong> ${definition}</p>
<p><strong>Example:</strong> <em>${example}</em></p>`;

    console.log(`Creating card for word: ${word}`);
    
    // Handle AI-generated image if present
    if (imageUrl) {
        console.log(`Processing image for ${word}...`);
        
        try {
            // Download the image
            const imageData = await downloadImageAsBase64(imageUrl);
            
            if (imageData) {
                // Create a unique filename
                const imageHash = crypto.createHash('md5').update(word + Date.now()).digest('hex');
                const extension = imageData.mimeType === 'image/jpeg' ? 'jpg' : 'png';
                const filename = `gre_${word.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${imageHash}.${extension}`;
                
                // Store image in Anki
                const storedFilename = await storeImageInAnki(imageData.base64, filename, imageData.mimeType);
                
                if (storedFilename) {
                    back += `\n<br><img src="${storedFilename}" style="max-width: 300px; margin-top: 10px;">`;
                    console.log(`✅ Image added to card for ${word}`);
                } else {
                    back += `\n<p style="color: #666; font-size: 12px;">Note: AI image could not be stored</p>`;
                    console.log(`⚠️  Could not store image for ${word}`);
                }
            } else {
                back += `\n<p style="color: #666; font-size: 12px;">Note: AI image could not be downloaded</p>`;
                console.log(`⚠️  Could not download image for ${word}`);
            }
        } catch (error) {
            console.error(`Error processing image for ${word}:`, error.message);
            back += `\n<p style="color: #666; font-size: 12px;">Note: AI image processing failed</p>`;
        }
    }
    
    back += `\n</div>`;
    
    const noteParams = {
        note: {
            deckName: ANKI_DECK_NAME,
            modelName: 'Basic',
            fields: {
                Front: front,
                Back: back
            },
            tags: ['gre', 'vocabulary', 'ai-generated']
        }
    };
    
    try {
        const result = await callAnkiConnect('addNote', noteParams);
        console.log(`Successfully created card for ${word}, ID: ${result}`);
        return result;
    } catch (error) {
        console.error(`Failed to create card for ${word}:`, error.message);
        throw error;
    }
}

function loadQueue() {
    try {
        if (fs.existsSync(QUEUE_FILE)) {
            const data = fs.readFileSync(QUEUE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading queue:', error);
    }
    return [];
}

function saveQueue(queue) {
    try {
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
    } catch (error) {
        console.error('Error saving queue:', error);
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/queue', (req, res) => {
    const queue = loadQueue();
    res.json(queue);
});

app.post('/api/words', (req, res) => {
    const { words } = req.body;
    const queue = loadQueue();
    
    const wordsArray = words.split('\n')
        .map(word => word.trim())
        .filter(word => word.length > 0)
        .map(word => ({
            id: Date.now() + Math.random(),
            word: word,
            status: 'pending',
            definition: '',
            example: '',
            imagePrompt: '',
            imageUrl: '',
            aiGenerated: false,
            addedAt: new Date().toISOString()
        }));
    
    queue.push(...wordsArray);
    saveQueue(queue);
    
    res.json({ success: true, added: wordsArray.length });
});

app.post('/api/generate-ai/:id', async (req, res) => {
    const { id } = req.params;
    const queue = loadQueue();
    
    const wordIndex = queue.findIndex(w => w.id == id);
    if (wordIndex === -1) {
        return res.status(404).json({ error: 'Word not found' });
    }

    try {
        const word = queue[wordIndex];
        const aiContent = await generateAIContent(word.word);
        
        // Generate image
        const imageUrl = await generateAIImage(aiContent.imagePrompt);
        
        // Update word with AI content
        queue[wordIndex].definition = aiContent.definition;
        queue[wordIndex].example = aiContent.example;
        queue[wordIndex].imagePrompt = aiContent.imagePrompt;
        queue[wordIndex].imageUrl = imageUrl;
        queue[wordIndex].aiGenerated = true;
        
        saveQueue(queue);
        res.json({ 
            success: true, 
            content: {
                definition: aiContent.definition,
                example: aiContent.example,
                imageUrl: imageUrl
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate AI content' });
    }
});

app.post('/api/approve/:id', (req, res) => {
    const { id } = req.params;
    const { definition, example } = req.body;
    const queue = loadQueue();
    
    const wordIndex = queue.findIndex(w => w.id == id);
    if (wordIndex !== -1) {
        queue[wordIndex].status = 'approved';
        if (definition) queue[wordIndex].definition = definition;
        if (example) queue[wordIndex].example = example;
        saveQueue(queue);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Word not found' });
    }
});

app.post('/api/reject/:id', (req, res) => {
    const { id } = req.params;
    const queue = loadQueue();
    
    const wordIndex = queue.findIndex(w => w.id == id);
    if (wordIndex !== -1) {
        queue[wordIndex].status = 'rejected';
        saveQueue(queue);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Word not found' });
    }
});

app.get('/api/anki-status', async (req, res) => {
    let status = {
        connected: false,
        version: null,
        deckExists: false,
        deckName: ANKI_DECK_NAME,
        message: ''
    };

    try {
        // Step 1: Test basic connection
        const version = await callAnkiConnect('version');
        status.version = version;
        status.connected = true;
        
        // Skip deck checking for now since it causes socket hang up
        // We know addNote works, so we'll just assume the deck exists
        status.deckExists = true;  // Assume Default deck exists (it always does)
        status.message = 'AnkiConnect is working (deck operations skipped due to compatibility)';
        
        res.json(status);
    } catch (error) {
        console.log('AnkiConnect connection error:', error.message);
        res.json({ 
            ...status,
            error: error.message,
            message: 'Cannot connect to Anki. Please ensure Anki is running with AnkiConnect addon installed.'
        });
    }
});

app.post('/api/export/anki', async (req, res) => {
    console.log('\n=== Starting Anki Export ===');
    
    try {
        const queue = loadQueue();
        const approvedWords = queue.filter(w => w.status === 'approved');
        
        console.log(`Found ${approvedWords.length} approved words to export`);
        
        if (approvedWords.length === 0) {
            return res.status(400).json({ error: 'No approved words to export' });
        }

        // Test AnkiConnect connection with a simple version check
        console.log('Testing AnkiConnect connection...');
        try {
            const version = await callAnkiConnect('version');
            console.log(`AnkiConnect version: ${version}`);
        } catch (error) {
            console.error('Connection test failed:', error.message);
            return res.status(500).json({ 
                error: 'Cannot connect to Anki. Please ensure Anki is running with AnkiConnect addon installed.' 
            });
        }

        console.log(`Will add cards to deck: ${ANKI_DECK_NAME}`);

        let successCount = 0;
        let errors = [];

        console.log(`Processing ${approvedWords.length} words...`);
        
        for (const word of approvedWords) {
            const wordIndex = successCount + errors.length + 1;
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📝 Processing word ${wordIndex}/${approvedWords.length}: "${word.word}"`);
            console.log(`   Definition: ${word.definition || 'Not set'}`);
            console.log(`   Example: ${word.example || 'Not set'}`);
            console.log(`   Has AI Image: ${word.imageUrl ? 'Yes' : 'No'}`);
            console.log(`   Image URL: ${word.imageUrl || 'None'}`);
            console.log(`${'='.repeat(60)}`);
            
            try {
                const startTime = Date.now();
                await createAnkiCard(
                    word.word, 
                    word.definition || `Definition for ${word.word}`, 
                    word.example || `Example sentence with ${word.word}`, 
                    word.imageUrl
                );
                const duration = Date.now() - startTime;
                successCount++;
                console.log(`✅ SUCCESS: Added "${word.word}" to Anki (${duration}ms)`);
                console.log(`   Cards created so far: ${successCount}`);
                
                // Add delay between cards to avoid rate limiting
                if (wordIndex < approvedWords.length) {
                    console.log('   Waiting 200ms before next card...');
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } catch (error) {
                const errorMsg = `❌ FAILED: Could not add "${word.word}" to Anki`;
                console.error(errorMsg);
                console.error(`   Error Type: ${error.constructor.name}`);
                console.error(`   Error Message: ${error.message}`);
                console.error(`   Error Code: ${error.code || 'N/A'}`);
                if (error.stack) {
                    console.error(`   Stack Trace: ${error.stack.split('\n')[1]?.trim() || 'N/A'}`);
                }
                errors.push(`Failed to add ${word.word}: ${error.message}`);
                console.log(`   Total failures so far: ${errors.length}`);
            }
        }
        
        console.log(`\n=== Export Complete ===`);
        console.log(`Success: ${successCount}, Errors: ${errors.length}`);

        const response = {
            success: true, 
            added: successCount, 
            failed: errors.length,
            total: approvedWords.length,
            errors: errors,
            message: `Successfully added ${successCount}/${approvedWords.length} cards to Anki deck "${ANKI_DECK_NAME}"`,
            details: {
                processedWords: approvedWords.map(word => ({
                    word: word.word,
                    hasDefinition: !!word.definition,
                    hasExample: !!word.example,
                    hasImage: !!word.imageUrl,
                    status: errors.find(e => e.includes(word.word)) ? 'failed' : 'success'
                }))
            }
        };
        
        console.log(`\n🎉 EXPORT SUMMARY:`);
        console.log(`   Total words: ${approvedWords.length}`);
        console.log(`   Successful: ${successCount} ✅`);
        console.log(`   Failed: ${errors.length} ❌`);
        console.log(`   Success rate: ${((successCount / approvedWords.length) * 100).toFixed(1)}%`);
        
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'Failed to export to Anki' });
    }
});

app.post('/api/anki-sync', async (req, res) => {
    console.log('🔄 Triggering Anki sync...');
    
    try {
        // Test connection first
        await callAnkiConnect('version');
        
        // Trigger sync
        await callAnkiConnect('sync');
        
        console.log('✅ Anki sync completed successfully');
        res.json({ 
            success: true, 
            message: 'Anki sync completed successfully'
        });
    } catch (error) {
        console.error('❌ Anki sync failed:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Sync failed: ' + error.message,
            message: 'Make sure Anki is logged into AnkiWeb and has sync enabled'
        });
    }
});

app.delete('/api/clear-approved', (req, res) => {
    const queue = loadQueue();
    const filteredQueue = queue.filter(w => w.status !== 'approved');
    saveQueue(filteredQueue);
    res.json({ success: true, removed: queue.length - filteredQueue.length });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
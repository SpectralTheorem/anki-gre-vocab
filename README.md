# GRE Vocabulary Manager

A powerful web application that uses AI to generate vocabulary cards and automatically adds them to Anki for studying.

## Features

- **AI-Powered Content Generation**: Uses OpenAI GPT-5-mini and DALL-E 3 to create definitions, example sentences, and memorable images
- **Direct Anki Integration**: Automatically adds cards to your Anki deck via AnkiConnect
- **Smart Review System**: Review and approve words before adding to Anki
- **Visual Memory Aid**: AI-generated images stored directly in Anki for better retention
- **Real-time Status**: Live connection status and detailed progress feedback
- **Robust Error Handling**: Automatic retry logic and comprehensive error reporting

## Quick Start

### Prerequisites

1. **Node.js** (v14 or higher)
2. **Anki Desktop** with AnkiConnect addon
3. **OpenAI API Key**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/anki-gre-vocab.git
   cd anki-gre-vocab
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ANKI_DECK_NAME=Default
   ANKI_CONNECT_URL=http://localhost:8765
   ```

4. **Install AnkiConnect in Anki**
   - Open Anki → Tools → Add-ons → Get Add-ons
   - Enter code: `2055492159`
   - Restart Anki

5. **Start the application**
   ```bash
   npm start
   ```

6. **Open your browser**
   Navigate to `http://localhost:3000`

## 📖 How to Use

### Step 1: Add Vocabulary Words
- Paste your GRE vocabulary words in the text area (one per line)
- Click "Add Words to Queue"

### Step 2: Generate AI Content
- Click "Generate AI" for each word to create:
  - Precise definitions
  - Contextual example sentences  
  - Memorable visual images

### Step 3: Review and Approve
- Review the AI-generated content
- Edit definitions/examples if needed
- Click "Approve" for words you want to add to Anki

### Step 4: Export to Anki
- Ensure Anki is running
- Check the status indicator (should show ✅ green)
- Click "Add to Anki Deck"
- Cards will be created with images stored locally in Anki

## 🛠️ Technical Details

### Architecture
- **Backend**: Node.js with Express
- **AI Services**: OpenAI GPT-5-mini and GPT Image 1, OpenAI's latest image generation model
- **Anki Integration**: AnkiConnect API
- **Frontend**: Vanilla JavaScript with real-time updates

### Key Features
- **Rate Limiting Protection**: Prevents overwhelming AnkiConnect
- **Retry Logic**: Automatically handles connection issues
- **Image Processing**: Downloads and stores AI images in Anki's media folder
- **Persistent Connections**: Optimized HTTP client for reliability

## 🔧 Configuration

### Environment Variables
- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `ANKI_DECK_NAME`: Target Anki deck name (default: "Default")
- `ANKI_CONNECT_URL`: AnkiConnect URL (default: "http://localhost:8765")

### Custom AI Prompts
You can customize how AI generates definitions, examples, and images by creating a `.config.txt` file:

1. **Copy the example file**:
   ```bash
   cp .config.example.txt .config.txt
   ```

2. **Edit the prompts** in `.config.txt`:
   - `[SYSTEM_PROMPT]`: The AI's role and behavior
   - `[USER_PROMPT_TEMPLATE]`: How to request content (use `{{WORD}}` as placeholder)
   - `[IMAGE_PROMPT_PREFIX]`: Style for image generation (use `{{IMAGE_DESCRIPTION}}` as placeholder)

3. **Restart the server** to apply changes:
   ```bash
   npm start
   ```

**Example customizations:**
- **Academic style**: Focus on etymology and formal language
- **Conversational style**: Use everyday language and relatable examples  
- **Memory palace**: Create bizarre, memorable visual scenes
- **Different image styles**: Watercolor, minimalist, artistic, etc.

### AnkiConnect Setup
The application requires AnkiConnect addon to be installed and running. Cards are created with:
- **Front**: Vocabulary word
- **Back**: Definition + Example + AI-generated image
- **Tags**: 'gre', 'vocabulary', 'ai-generated'

## Troubleshooting

### Common Issues

**❌ "Cannot connect to Anki"**
- Ensure Anki Desktop is running
- Check that AnkiConnect addon is installed

**❌ "AI generation failed"**
- Check your OpenAI API key in `.env`
- Ensure you have sufficient API credits
- Check internet connection

**❌ "Cards not appearing in Anki"**
- Check the target deck name in `.env`
- Verify AnkiConnect permissions
- Look for error messages in console


### Project Structure
```
anki-gre-vocab/
├── server.js          # Main server file
├── public/
│   └── index.html     # Frontend interface
├── package.json       # Dependencies
├── .env.example       # Environment template
└── README.md         # This file
```

### Scripts
- `npm start`: Start the production server
- `npm run dev`: Start with nodemon for development

## 📄 License

This project is licensed under the MIT License.


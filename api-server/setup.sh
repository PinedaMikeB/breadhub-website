#!/bin/bash

# BreadHub POS API - Quick Setup Script

echo "=================================================="
echo "  BreadHub POS API - Setup Script"
echo "=================================================="
echo ""

# Check if running from correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the api-server directory"
    echo "   cd /Volumes/Wotg\ Drive\ Mike/GitHub/Breadhub-website/api-server"
    exit 1
fi

# Step 1: Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Step 2: Check for .env file
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "🔑 IMPORTANT: Please edit .env and set your API_KEY"
    echo "   nano .env"
    echo ""
else
    echo "✅ .env file already exists"
    echo ""
fi

# Step 3: Check for Firebase service account
if [ ! -f "firebase-service-account.json" ]; then
    echo "⚠️  Firebase service account not found!"
    echo ""
    echo "📋 To get your Firebase service account:"
    echo "   1. Go to https://console.firebase.google.com/"
    echo "   2. Select 'breadhub-proofmaster' project"
    echo "   3. Click ⚙️ > Project Settings"
    echo "   4. Go to 'Service Accounts' tab"
    echo "   5. Click 'Generate New Private Key'"
    echo "   6. Save as: firebase-service-account.json"
    echo "   7. Move file to: $(pwd)"
    echo ""
    echo "⏸️  Setup paused. Please add firebase-service-account.json and run again."
    exit 1
else
    echo "✅ Firebase service account found"
    echo ""
fi

# Step 4: Generate a secure API key if not set
if grep -q "your-secure-api-key-here-change-this" .env; then
    echo "🔐 Generating secure API key..."
    NEW_KEY=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)
    
    # Update .env with new key (macOS compatible)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/API_KEY=.*/API_KEY=$NEW_KEY/" .env
    else
        sed -i "s/API_KEY=.*/API_KEY=$NEW_KEY/" .env
    fi
    
    echo "✅ New API key generated and saved to .env"
    echo "   API Key: $NEW_KEY"
    echo ""
    echo "⚠️  SAVE THIS KEY - You'll need it for OpenClaw!"
    echo ""
else
    echo "✅ API key already configured"
    echo ""
fi

# Step 5: Final instructions
echo "=================================================="
echo "  ✅ Setup Complete!"
echo "=================================================="
echo ""
echo "🚀 To start the server:"
echo "   npm start          # Production mode"
echo "   npm run dev        # Development mode (auto-reload)"
echo ""
echo "📖 Documentation:"
echo "   See README.md for full API documentation"
echo ""
echo "🧪 Test the API:"
echo "   npm test           # Run test suite"
echo ""
echo "🔗 Once running, the API will be available at:"
echo "   http://localhost:3001"
echo ""
echo "=================================================="

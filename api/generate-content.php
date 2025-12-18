<?php
/**
 * BreadHub SEO Content Generator API
 * Secure endpoint for generating product descriptions using Claude AI
 */

// Security headers
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');

// CORS - Only allow your domain
$allowedOrigins = [
    'https://breadhub.shop',
    'http://breadhub.shop',
    'http://localhost',
    'file://' // For local testing
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
$isAllowed = false;

foreach ($allowedOrigins as $allowed) {
    if (strpos($origin, $allowed) === 0) {
        $isAllowed = true;
        header('Access-Control-Allow-Origin: ' . $origin);
        break;
    }
}

if (!$isAllowed && $origin) {
    http_response_code(403);
    die(json_encode(['error' => 'Forbidden origin']));
}

header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die(json_encode(['error' => 'Method not allowed']));
}

// Start session for rate limiting
session_start();

// Rate limiting - 20 requests per hour per session
$rateLimit = 20;
$timeWindow = 3600; // 1 hour

if (!isset($_SESSION['api_calls'])) {
    $_SESSION['api_calls'] = [];
}

// Clean old calls
$_SESSION['api_calls'] = array_filter(
    $_SESSION['api_calls'],
    function($time) use ($timeWindow) {
        return time() - $time < $timeWindow;
    }
);

if (count($_SESSION['api_calls']) >= $rateLimit) {
    http_response_code(429);
    die(json_encode([
        'error' => 'Rate limit exceeded',
        'message' => 'Maximum ' . $rateLimit . ' requests per hour. Try again later.'
    ]));
}

$_SESSION['api_calls'][] = time();

// Load API key from .env file
$envFile = __DIR__ . '/../.env';
$apiKey = '';

if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue; // Skip comments
        if (strpos($line, 'CLAUDE_API_KEY=') === 0) {
            $apiKey = trim(substr($line, strlen('CLAUDE_API_KEY=')));
            break;
        }
    }
}

if (empty($apiKey) || $apiKey === 'your-api-key-here') {
    http_response_code(500);
    die(json_encode([
        'error' => 'API key not configured',
        'message' => 'Please set CLAUDE_API_KEY in .env file'
    ]));
}

// Get and validate input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    die(json_encode(['error' => 'Invalid JSON input']));
}

$productName = trim($input['productName'] ?? '');
$category = trim($input['category'] ?? '');
$price = floatval($input['price'] ?? 0);
$note = trim($input['note'] ?? '');

// Validation
if (empty($productName)) {
    http_response_code(400);
    die(json_encode(['error' => 'Product name is required']));
}

if (empty($category)) {
    http_response_code(400);
    die(json_encode(['error' => 'Category is required']));
}

// Sanitize inputs
$productName = htmlspecialchars($productName, ENT_QUOTES, 'UTF-8');
$category = htmlspecialchars($category, ENT_QUOTES, 'UTF-8');
$note = htmlspecialchars($note, ENT_QUOTES, 'UTF-8');

// Build the prompt for Claude
$prompt = <<<PROMPT
You are an expert SEO content writer for BreadHub, a bakery in Taytay, Rizal, Philippines.

Generate TWO descriptions for this product:

**Product Details:**
- Name: {$productName}
- Category: {$category}
- Price: ₱{$price}
- Additional Notes: {$note}

**Requirements:**

1. SHORT DESCRIPTION (for product cards):
   - Exactly 70-80 characters
   - Include key appeal + benefit
   - Natural, enticing language
   - Example: "Soft fluffy pandesal baked fresh daily. Perfect breakfast bread!"

2. FULL DESCRIPTION (for SEO product pages):
   - 350-450 words
   - Include these sections with ### headings:
     * Opening paragraph (80-100 words) with product name, key features, "Taytay, Rizal", use cases
     * ### What Makes It Special (4-5 bullet points with features)
     * ### Perfect Pairings (mention complementary products naturally)
     * ### Ingredients (list main ingredients with keywords)
     * ### Serving Suggestions (how to enjoy, storage, reheating)
     * Closing paragraph (40-60 words) with location keywords and call-to-action
   
   - SEO Keywords to include naturally (2-3 times each):
     * "{$productName} taytay"
     * "{$category} rizal"
     * "fresh baked", "premium ingredients"
     * Location: Taytay, Cainta, Angono, Rizal
   
   - Internal linking placeholders (use this exact format):
     * [LINK:category-name] for category links
     * [LINK:related-product] for product links
     Examples: "Try our [LINK:donuts] collection" or "Pairs well with [LINK:coffee]"
   
   - Write in warm, friendly, professional tone
   - Focus on sensory details (taste, texture, aroma)
   - Emphasize freshness and quality
   - Include call-to-action about delivery

**Response Format (JSON):**
```json
{
  "shortDescription": "Your 70-80 character description here",
  "fullDescription": "Your 350-450 word SEO-rich description here with all sections",
  "suggestedKeywords": ["keyword1", "keyword2", "keyword3"],
  "relatedProducts": ["product1", "product2", "product3"]
}
```

Generate the content now:
PROMPT;

// Prepare Claude API request
$claudeRequest = [
    'model' => 'claude-sonnet-4-20250514',
    'max_tokens' => 2500,
    'messages' => [
        [
            'role' => 'user',
            'content' => $prompt
        ]
    ]
];

// Call Claude API
$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01'
    ],
    CURLOPT_POSTFIELDS => json_encode($claudeRequest),
    CURLOPT_TIMEOUT => 30
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// Handle errors
if ($curlError) {
    http_response_code(500);
    die(json_encode([
        'error' => 'API request failed',
        'message' => $curlError
    ]));
}

if ($httpCode !== 200) {
    http_response_code($httpCode);
    die($response);
}

$claudeResponse = json_decode($response, true);

// Extract the text content
if (!isset($claudeResponse['content'][0]['text'])) {
    http_response_code(500);
    die(json_encode([
        'error' => 'Invalid API response',
        'message' => 'Unable to extract content from Claude API'
    ]));
}

$generatedText = $claudeResponse['content'][0]['text'];

// Try to extract JSON from the response
preg_match('/```json\s*(.*?)\s*```/s', $generatedText, $matches);
if ($matches) {
    $jsonContent = json_decode($matches[1], true);
    if ($jsonContent) {
        $result = $jsonContent;
    } else {
        // Fallback: parse as plain text
        $result = [
            'shortDescription' => substr($generatedText, 0, 80),
            'fullDescription' => $generatedText,
            'suggestedKeywords' => [],
            'relatedProducts' => []
        ];
    }
} else {
    // No JSON found, return as-is
    $result = [
        'shortDescription' => substr($generatedText, 0, 80),
        'fullDescription' => $generatedText,
        'suggestedKeywords' => [],
        'relatedProducts' => []
    ];
}

// Log successful generation (for monitoring)
$logFile = __DIR__ . '/usage.log';
$logEntry = date('Y-m-d H:i:s') . " | {$productName} | {$category} | Success\n";
file_put_contents($logFile, $logEntry, FILE_APPEND);

// Daily usage tracking
$dailyCallsFile = __DIR__ . '/daily_calls.json';
$today = date('Y-m-d');
$calls = file_exists($dailyCallsFile) 
    ? json_decode(file_get_contents($dailyCallsFile), true) 
    : [];

if (!isset($calls[$today])) {
    $calls[$today] = 0;
}
$calls[$today]++;

file_put_contents($dailyCallsFile, json_encode($calls));

// Return success
echo json_encode([
    'success' => true,
    'data' => $result,
    'usage' => [
        'callsToday' => $calls[$today],
        'remainingThisHour' => $rateLimit - count($_SESSION['api_calls'])
    ]
]);

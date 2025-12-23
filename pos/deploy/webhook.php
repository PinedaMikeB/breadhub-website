<?php
/**
 * BreadHub POS - GitHub Webhook Auto-Deployment
 * 
 * Setup on Hostinger:
 * 1. Upload this file to: public_html/pos.breadhub.shop/deploy/webhook.php
 * 2. In GitHub repo settings → Webhooks → Add webhook
 * 3. Payload URL: https://pos.breadhub.shop/deploy/webhook.php
 * 4. Content type: application/json
 * 5. Secret: (set same as WEBHOOK_SECRET below)
 * 6. Events: Just the push event
 */

// ============ CONFIGURATION ============
define('WEBHOOK_SECRET', 'breadhub-pos-deploy-2024');  // Change this in production!
define('LOG_FILE', __DIR__ . '/deploy.log');
define('REPO_DIR', dirname(__DIR__));  // One level up from /deploy

// ============ FUNCTIONS ============
function log_msg($msg) {
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents(LOG_FILE, "[$timestamp] $msg\n", FILE_APPEND);
}

function verify_signature($payload, $signature) {
    if (empty($signature)) return false;
    $expected = 'sha256=' . hash_hmac('sha256', $payload, WEBHOOK_SECRET);
    return hash_equals($expected, $signature);
}

// ============ MAIN ============
header('Content-Type: application/json');

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get payload
$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';

// Verify signature
if (!verify_signature($payload, $signature)) {
    http_response_code(403);
    log_msg('ERROR: Invalid signature');
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

// Parse payload
$data = json_decode($payload, true);

// Only deploy on push to main branch
$ref = $data['ref'] ?? '';
if ($ref !== 'refs/heads/main') {
    log_msg("Ignoring push to non-main branch: $ref");
    echo json_encode(['status' => 'ignored', 'reason' => 'not main branch']);
    exit;
}

// Log deployment start
$pusher = $data['pusher']['name'] ?? 'unknown';
$commit = $data['head_commit']['message'] ?? 'no message';
log_msg("Deploy started by $pusher: $commit");

// Execute git pull
chdir(REPO_DIR);
$output = [];
$return_var = 0;

exec('git fetch origin main 2>&1', $output, $return_var);
exec('git reset --hard origin/main 2>&1', $output, $return_var);

if ($return_var === 0) {
    log_msg("Deploy SUCCESS");
    echo json_encode([
        'status' => 'success',
        'output' => implode("\n", $output)
    ]);
} else {
    log_msg("Deploy FAILED: " . implode("\n", $output));
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'output' => implode("\n", $output)
    ]);
}

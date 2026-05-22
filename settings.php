<?php
// Set error handling to not output errors directly
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Start output buffering to catch any unwanted output
ob_start();

// Prevent session_start if session already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once 'config.php';

// Clear any output buffered from config.php
ob_clean();

header('Content-Type: application/json; charset=utf-8');

if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';

if (empty($action)) {
    http_response_code(400);
    echo json_encode(['error' => 'No action specified']);
    exit;
}

try {
    switch ($action) {
        case 'get_profile':
            getProfile();
            break;
        case 'update_profile':
            updateProfile();
            break;
        case 'upload_profile_picture':
            uploadProfilePicture();
            break;
        case 'request_password_reset':
            requestPasswordReset();
            break;
        case 'verify_reset_otp':
            verifyResetOTP();
            break;
        case 'reset_password':
            resetPasswordSettings();
            break;
        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action: ' . $action]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}

exit;

function getProfile() {
    global $pdo;
    
    $stmt = $pdo->prepare("SELECT id, email, full_name, role, profile_picture, created_at FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    
    if (!$user) {
        echo json_encode(['error' => 'User not found']);
        return;
    }
    
    echo json_encode(['success' => true, 'user' => $user]);
}

function updateProfile() {
    global $pdo;
    
    $full_name = $_POST['full_name'] ?? '';
    
    if (empty($full_name)) {
        echo json_encode(['error' => 'Full name cannot be empty']);
        return;
    }
    
    $stmt = $pdo->prepare("UPDATE users SET full_name = ? WHERE id = ?");
    
    try {
        $stmt->execute([$full_name, $_SESSION['user_id']]);
        
        // Update session
        $_SESSION['full_name'] = $full_name;
        
        echo json_encode(['success' => true, 'message' => 'Profile updated successfully']);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to update profile']);
    }
}

function uploadProfilePicture() {
    global $pdo;
    
    if (!isLoggedIn()) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized - please login']);
        return;
    }
    
    if (!isset($_FILES['profile_picture'])) {
        echo json_encode(['error' => 'No file uploaded']);
        return;
    }
    
    $file = $_FILES['profile_picture'];
    
    // Check for upload errors
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errorMsg = 'Upload error';
        switch ($file['error']) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                $errorMsg = 'File size exceeds limit';
                break;
            case UPLOAD_ERR_PARTIAL:
                $errorMsg = 'File upload was interrupted';
                break;
            case UPLOAD_ERR_NO_FILE:
                $errorMsg = 'No file was uploaded';
                break;
            case UPLOAD_ERR_NO_TMP_DIR:
                $errorMsg = 'Temporary folder missing';
                break;
            case UPLOAD_ERR_CANT_WRITE:
                $errorMsg = 'Cannot write file to disk';
                break;
        }
        echo json_encode(['error' => $errorMsg]);
        return;
    }
    
    // Validate file type
    $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!in_array($file['type'], $allowedTypes)) {
        echo json_encode(['error' => 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed']);
        return;
    }
    
    // Validate file size (5MB limit)
    if ($file['size'] > 5 * 1024 * 1024) {
        echo json_encode(['error' => 'File size exceeds 5MB limit']);
        return;
    }
    
    // Check if uploads directory exists and create if needed
    $uploadDir = __DIR__ . '/uploads/';
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            echo json_encode(['error' => 'Failed to create uploads directory. Contact admin.']);
            return;
        }
    }
    
    // Verify directory is writable
    if (!is_writable($uploadDir)) {
        echo json_encode(['error' => 'Uploads directory is not writable. Contact admin.']);
        return;
    }
    
    // Generate unique filename
    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    
    // Validate extension matches MIME type
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (!in_array($extension, $allowedExtensions)) {
        echo json_encode(['error' => 'Invalid file extension']);
        return;
    }
    
    $filename = uniqid() . '_' . time() . '.' . $extension;
    $uploadPath = $uploadDir . $filename;
    
    // Move uploaded file
    if (!move_uploaded_file($file['tmp_name'], $uploadPath)) {
        echo json_encode(['error' => 'Failed to move uploaded file. Check directory permissions.']);
        return;
    }
    
    // Set proper permissions on the uploaded file
    @chmod($uploadPath, 0644);
    
    // Delete old profile picture if exists
    try {
        $stmt = $pdo->prepare("SELECT profile_picture FROM users WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();
        
        if ($user && $user['profile_picture']) {
            $oldPath = $uploadDir . $user['profile_picture'];
            if (file_exists($oldPath)) {
                @unlink($oldPath);
            }
        }
    } catch (Exception $e) {
        // Log error but continue
        error_log('Error deleting old profile picture: ' . $e->getMessage());
    }
    
    // Update database
    $stmt = $pdo->prepare("UPDATE users SET profile_picture = ? WHERE id = ?");
    
    try {
        $stmt->execute([$filename, $_SESSION['user_id']]);
        echo json_encode(['success' => true, 'profile_picture' => $filename, 'message' => 'Profile picture updated successfully']);
    } catch (PDOException $e) {
        // Delete uploaded file if database update fails
        @unlink($uploadPath);
        error_log('Database error updating profile picture: ' . $e->getMessage());
        echo json_encode(['error' => 'Failed to update profile picture in database']);
    }
}

function requestPasswordReset() {
    global $pdo;
    
    // Generate OTP
    $otp_code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $otp_expiry = date('Y-m-d H:i:s', strtotime('+' . OTP_EXPIRY . ' minutes'));
    
    // Update user with OTP
    $stmt = $pdo->prepare("UPDATE users SET otp_code = ?, otp_expiry = ? WHERE id = ?");
    
    try {
        $stmt->execute([$otp_code, $otp_expiry, $_SESSION['user_id']]);
        
        // Send OTP email
        $emailSent = sendOTPEmail($_SESSION['email'], $_SESSION['full_name'], $otp_code);
        
        if ($emailSent) {
            echo json_encode(['success' => true, 'message' => 'OTP sent to your email']);
        } else {
            echo json_encode(['error' => 'Failed to send OTP email']);
        }
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to request password reset']);
    }
}

function verifyResetOTP() {
    global $pdo;
    
    $otp = $_POST['otp'] ?? '';
    
    if (empty($otp)) {
        echo json_encode(['error' => 'OTP is required']);
        return;
    }
    
    $stmt = $pdo->prepare("SELECT otp_code, otp_expiry FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    
    if (!$user) {
        echo json_encode(['error' => 'User not found']);
        return;
    }
    
    if ($user['otp_code'] !== $otp) {
        echo json_encode(['error' => 'Invalid OTP']);
        return;
    }
    
    if (strtotime($user['otp_expiry']) < time()) {
        echo json_encode(['error' => 'OTP has expired']);
        return;
    }
    
    echo json_encode(['success' => true, 'message' => 'OTP verified successfully']);
}

function resetPasswordSettings() {
    global $pdo;
    
    $otp = $_POST['otp'] ?? '';
    $password = $_POST['password'] ?? '';
    $confirm_password = $_POST['confirm_password'] ?? '';
    
    if (empty($otp) || empty($password) || empty($confirm_password)) {
        echo json_encode(['error' => 'All fields are required']);
        return;
    }
    
    // Validate OTP
    $stmt = $pdo->prepare("SELECT otp_code, otp_expiry FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    
    if (!$user) {
        echo json_encode(['error' => 'User not found']);
        return;
    }
    
    if ($user['otp_code'] !== $otp) {
        echo json_encode(['error' => 'Invalid OTP']);
        return;
    }
    
    if (strtotime($user['otp_expiry']) < time()) {
        echo json_encode(['error' => 'OTP has expired']);
        return;
    }
    
    // Validate password
    if ($password !== $confirm_password) {
        echo json_encode(['error' => 'Passwords do not match']);
        return;
    }
    
    if (strlen($password) < 8) {
        echo json_encode(['error' => 'Password must be at least 8 characters long']);
        return;
    }
    
    if (!preg_match('/[A-Z]/', $password)) {
        echo json_encode(['error' => 'Password must contain at least one uppercase letter']);
        return;
    }
    
    if (!preg_match('/[0-9]/', $password)) {
        echo json_encode(['error' => 'Password must contain at least one number']);
        return;
    }
    
    // Hash password and update
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    
    $stmt = $pdo->prepare("UPDATE users SET password = ?, otp_code = NULL, otp_expiry = NULL WHERE id = ?");
    
    try {
        $stmt->execute([$hashedPassword, $_SESSION['user_id']]);
        echo json_encode(['success' => true, 'message' => 'Password reset successfully']);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to reset password']);
    }
}

function sendOTPEmail($email, $name, $otp) {
    try {
        // Prepare email headers
        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: " . SMTP_FROM_NAME . " <" . SMTP_FROM_EMAIL . ">\r\n";
        $headers .= "Reply-To: " . SMTP_FROM_EMAIL . "\r\n";
        
        $subject = 'Your OTP Code';
        
        $body = "
            <html>
                <body style='font-family: Arial, sans-serif;'>
                    <h2>Password Reset OTP</h2>
                    <p>Hi $name,</p>
                    <p>Your OTP code is: <strong style='font-size: 24px; color: #2563eb;'>$otp</strong></p>
                    <p>This code will expire in " . OTP_EXPIRY . " minutes.</p>
                    <p><strong>Do not share this code with anyone.</strong></p>
                    <hr>
                    <p style='color: #666; font-size: 12px;'>This is an automated message from " . SMTP_FROM_NAME . "</p>
                </body>
            </html>
        ";
        
        // Try to send using SMTP if available
        if (!empty(SMTP_HOST) && !empty(SMTP_USERNAME)) {
            return sendSMTPEmail($email, $subject, $body, $headers);
        } else {
            // Fallback to mail() function
            return mail($email, $subject, $body, $headers);
        }
    } catch (Exception $e) {
        error_log('Email error: ' . $e->getMessage());
        return false;
    }
}

function sendSMTPEmail($to, $subject, $body, $headers) {
    try {
        // Create SSL/TLS context
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true,
            ]
        ]);
        
        // Connect to SMTP server using stream_socket_client
        $errno = 0;
        $errstr = '';
        $smtp = stream_socket_client(
            'tcp://' . SMTP_HOST . ':' . SMTP_PORT,
            $errno,
            $errstr,
            30,
            STREAM_CLIENT_CONNECT,
            $context
        );
        
        if (!$smtp) {
            error_log("SMTP connection failed: $errstr ($errno)");
            return false;
        }
        
        stream_set_blocking($smtp, true);
        
        // Read greeting
        $response = fgets($smtp, 1024);
        if (substr($response, 0, 3) !== '220') {
            stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
            error_log("SMTP greeting failed: $response");
            return false;
        }
        
        // Send EHLO
        fwrite($smtp, "EHLO localhost\r\n");
        while (true) {
            $response = fgets($smtp, 1024);
            if (substr($response, 3, 1) !== '-') break;
        }
        
        // Start TLS
        fwrite($smtp, "STARTTLS\r\n");
        $response = fgets($smtp, 1024);
        if (substr($response, 0, 3) !== '220') {
            stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
            error_log("STARTTLS failed: $response");
            return false;
        }
        
        // Enable crypto
        if (!stream_socket_enable_crypto($smtp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
            error_log("TLS negotiation failed");
            return false;
        }
        
        // Send EHLO again after TLS
        fwrite($smtp, "EHLO localhost\r\n");
        while (true) {
            $response = fgets($smtp, 1024);
            if (substr($response, 3, 1) !== '-') break;
        }
        
        // Authenticate
        fwrite($smtp, "AUTH LOGIN\r\n");
        $response = fgets($smtp, 1024);
        if (substr($response, 0, 3) !== '334') {
            stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
            error_log("AUTH LOGIN failed: $response");
            return false;
        }
        
        // Send username
        fwrite($smtp, base64_encode(SMTP_USERNAME) . "\r\n");
        $response = fgets($smtp, 1024);
        if (substr($response, 0, 3) !== '334') {
            stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
            error_log("Username authentication failed: $response");
            return false;
        }
        
        // Send password
        fwrite($smtp, base64_encode(SMTP_PASSWORD) . "\r\n");
        $response = fgets($smtp, 1024);
        
        if (substr($response, 0, 3) !== '235') {
            stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
            error_log("SMTP authentication failed: $response");
            return false;
        }
        
        // Send mail
        fwrite($smtp, "MAIL FROM: <" . SMTP_FROM_EMAIL . ">\r\n");
        $response = fgets($smtp, 1024);
        if (substr($response, 0, 3) !== '250') {
            stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
            error_log("MAIL FROM failed: $response");
            return false;
        }
        
        fwrite($smtp, "RCPT TO: <$to>\r\n");
        $response = fgets($smtp, 1024);
        if (substr($response, 0, 3) !== '250') {
            stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
            error_log("RCPT TO failed: $response");
            return false;
        }
        
        fwrite($smtp, "DATA\r\n");
        $response = fgets($smtp, 1024);
        if (substr($response, 0, 3) !== '354') {
            stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
            error_log("DATA command failed: $response");
            return false;
        }
        
        // Send headers and body
        fwrite($smtp, "To: $to\r\n");
        fwrite($smtp, "Subject: $subject\r\n");
        fwrite($smtp, $headers);
        fwrite($smtp, "\r\n");
        fwrite($smtp, $body);
        fwrite($smtp, "\r\n.\r\n");
        
        $response = fgets($smtp, 1024);
        if (substr($response, 0, 3) !== '250') {
            stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
            error_log("SMTP send failed: $response");
            return false;
        }
        
        // Close connection
        fwrite($smtp, "QUIT\r\n");
        stream_socket_shutdown($smtp, STREAM_SHUT_RDWR);
        
        return true;
    } catch (Exception $e) {
        error_log('SMTP error: ' . $e->getMessage());
        return false;
    }
}
?>

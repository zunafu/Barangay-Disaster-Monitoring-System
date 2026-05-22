<?php
require_once 'config.php';

header('Content-Type: application/json');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'login':
        login();
        break;
    case 'register':
        register();
        break;
    case 'logout':
        logout();
        break;
    case 'check':
        checkAuth();
        break;
    case 'verify-otp':
        verifyOTP();
        break;
    case 'resend-otp':
        resendOTP();
        break;
    case 'forgot-password':
        forgotPassword();
        break;
    case 'reset-password':
        resetPassword();
        break;
    default:
        echo json_encode(['error' => 'Invalid action']);
}

function login()
{
    global $pdo;

    $email = $_POST['email'] ?? '';
    $password = $_POST['password'] ?? '';

    if (empty($email) || empty($password)) {
        echo json_encode(['error' => 'Email and password are required']);
        return;
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode(['error' => 'Invalid email or password']);
        return;
    }

    // Check if account is active
    if (!$user['is_active']) {
        echo json_encode(['error' => 'Your account has been deactivated. Please contact an administrator.']);
        return;
    }

    // Check if account is verified
    if (!$user['is_verified']) {
        echo json_encode(['error' => 'Email not verified. Please verify your email before logging in.', 'unverified' => true]);
        return;
    }

    if (password_verify($password, $user['password'])) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['email'] = $user['email'];
        $_SESSION['full_name'] = $user['full_name'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['profile_picture'] = $user['profile_picture'];

        echo json_encode([
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'full_name' => $user['full_name'],
                'role' => $user['role'],
                'profile_picture' => $user['profile_picture']
            ]
        ]);
    } else {
        echo json_encode(['error' => 'Invalid email or password']);
    }
}

function register()
{
    global $pdo;

    $email = $_POST['email'] ?? '';
    $password = $_POST['password'] ?? '';
    $full_name = $_POST['full_name'] ?? '';

    if (empty($email) || empty($password) || empty($full_name)) {
        echo json_encode(['error' => 'All fields are required']);
        return;
    }

    // Validate email format
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['error' => 'Invalid email format']);
        return;
    }

    // Validate password strength (essentials only)
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

    // Generate 6-digit OTP
    $otp_code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $otp_expiry = date('Y-m-d H:i:s', strtotime('+' . OTP_EXPIRY . ' minutes'));

    // Hash password
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    // Check if email exists
    $stmt = $pdo->prepare("SELECT id, full_name, is_verified FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $existingUser = $stmt->fetch();

    try {
        if ($existingUser) {
            // Email already exists
            if ($existingUser['is_verified']) {
                // Account is verified - don't allow re-registration
                echo json_encode(['error' => 'This email is already registered and verified. Please login with your email and password or reset your password if you forgot it.']);
                return;
            } else {
                // Account exists but not verified - allow to update and resend OTP
                $stmt = $pdo->prepare("UPDATE users SET full_name = ?, password = ?, otp_code = ?, otp_expiry = ? WHERE email = ?");
                $stmt->execute([$full_name, $hashedPassword, $otp_code, $otp_expiry, $email]);
                $message = 'Account updated! OTP has been sent to your email.';
            }
        } else {
            // New email - insert new user
            $stmt = $pdo->prepare("INSERT INTO users (email, password, full_name, role, otp_code, otp_expiry, is_verified) VALUES (?, ?, ?, 'user', ?, ?, 0)");
            $stmt->execute([$email, $hashedPassword, $full_name, $otp_code, $otp_expiry]);
            $message = 'Registration successful! OTP has been sent to your email.';
        }

        // Send OTP email
        $emailSent = sendOTPEmail($email, $full_name, $otp_code);

        if ($emailSent) {
            echo json_encode([
                'success' => true,
                'message' => $message,
                'email' => $email
            ]);
        } else {
            // Email failed - account exists, they can resend OTP later
            echo json_encode(['error' => 'Account updated but failed to send OTP. Click Resend OTP to try again.', 'email' => $email]);
        }
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Registration failed: ' . $e->getMessage()]);
    }
}

function logout()
{
    session_destroy();
    echo json_encode(['success' => true]);
}

function checkAuth()
{
    global $pdo;

    if (isLoggedIn()) {
        // Fetch latest user data from database to ensure profile_picture is current
        $stmt = $pdo->prepare("SELECT id, email, full_name, role, profile_picture FROM users WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();

        if ($user) {
            // Update session with latest data
            $_SESSION['profile_picture'] = $user['profile_picture'];

            echo json_encode([
                'authenticated' => true,
                'user' => [
                    'id' => $user['id'],
                    'email' => $user['email'],
                    'full_name' => $user['full_name'],
                    'role' => $user['role'],
                    'profile_picture' => $user['profile_picture']
                ]
            ]);
        } else {
            echo json_encode(['authenticated' => false]);
        }
    } else {
        echo json_encode(['authenticated' => false]);
    }
}

// Verify OTP
function verifyOTP()
{
    global $pdo;

    $email = $_POST['email'] ?? '';
    $otp = $_POST['otp'] ?? '';

    if (empty($email) || empty($otp)) {
        echo json_encode(['error' => 'Email and OTP are required']);
        return;
    }

    $stmt = $pdo->prepare("SELECT id, otp_code, otp_expiry FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode(['error' => 'User not found']);
        return;
    }

    // Check if OTP matches
    if ($user['otp_code'] !== $otp) {
        echo json_encode(['error' => 'Invalid OTP']);
        return;
    }

    // Check if OTP has expired
    if (strtotime($user['otp_expiry']) < time()) {
        echo json_encode(['error' => 'OTP has expired. Please request a new one.']);
        return;
    }

    // Mark email as verified and clear OTP
    $updateStmt = $pdo->prepare("UPDATE users SET is_verified = 1, otp_code = NULL, otp_expiry = NULL WHERE id = ?");
    $updateStmt->execute([$user['id']]);

    echo json_encode([
        'success' => true,
        'message' => 'Email verified successfully! You can now login.'
    ]);
}

// Resend OTP
function resendOTP()
{
    global $pdo;

    $email = $_POST['email'] ?? '';

    if (empty($email)) {
        echo json_encode(['error' => 'Email is required']);
        return;
    }

    $stmt = $pdo->prepare("SELECT id, full_name FROM users WHERE email = ? AND is_verified = 0");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode(['error' => 'No unverified account found with this email']);
        return;
    }

    // Generate new OTP
    $otp_code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $otp_expiry = date('Y-m-d H:i:s', strtotime('+' . OTP_EXPIRY . ' minutes'));

    // Update OTP
    $updateStmt = $pdo->prepare("UPDATE users SET otp_code = ?, otp_expiry = ? WHERE id = ?");
    $updateStmt->execute([$otp_code, $otp_expiry, $user['id']]);

    // Send OTP email
    $emailSent = sendOTPEmail($email, $user['full_name'], $otp_code);

    if ($emailSent) {
        echo json_encode([
            'success' => true,
            'message' => 'New OTP has been sent to your email.'
        ]);
    } else {
        echo json_encode(['error' => 'Failed to send OTP email. Please check email configuration or try again.']);
    }
}

// Send OTP email
function sendOTPEmail($email, $fullName, $otp)
{
    $to = $email;
    $subject = "Your Verification Code - " . APP_NAME;

    $message = "
    <html>
    <head>
        <title>OTP Verification</title>
    </head>
    <body>
        <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;'>
            <h2>Welcome to " . htmlspecialchars(APP_NAME) . "</h2>
            <p>Hi " . htmlspecialchars($fullName) . ",</p>
            <p>Thank you for registering! Your One-Time Password (OTP) is:</p>
            <div style='background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;'>
                <h1 style='margin: 0; color: #2563eb; letter-spacing: 5px;'>" . htmlspecialchars($otp) . "</h1>
            </div>
            <p>This OTP expires in " . OTP_EXPIRY . " minutes.</p>
            <p><strong>Important:</strong> Do not share this code with anyone. We will never ask for your OTP.</p>
            <hr style='border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;'>
            <p style='color: #666; font-size: 12px;'>" . htmlspecialchars(APP_NAME) . "<br>If you did not register for this account, please ignore this email.</p>
        </div>
    </body>
    </html>
    ";

    // Send via SMTP
    return sendViaSMTP($to, $subject, $message);
}

// SMTP Email sending function using native sockets
function sendViaSMTP($to, $subject, $message)
{
    $host = SMTP_HOST;
    $port = SMTP_PORT;
    $username = SMTP_USERNAME;
    $password = SMTP_PASSWORD;
    $from = SMTP_FROM_EMAIL;
    $fromName = SMTP_FROM_NAME;

    if (empty($username) || empty($password)) {
        error_log("SMTP credentials not configured");
        return false;
    }

    try {
        // Connect to SMTP server
        $smtp = @fsockopen($host, $port, $errno, $errstr, 10);

        if (!$smtp) {
            error_log("SMTP Connection failed: $errstr ($errno)");
            return false;
        }

        // Read greeting
        $response = fgets($smtp, 1024);
        if (substr($response, 0, 3) != '220') {
            error_log("SMTP greeting failed: $response");
            fclose($smtp);
            return false;
        }

        // Send EHLO
        fputs($smtp, "EHLO localhost\r\n");
        $response = fgets($smtp, 1024);
        while (substr($response, 3, 1) == '-') {
            $response = fgets($smtp, 1024);
        }

        // Start TLS
        fputs($smtp, "STARTTLS\r\n");
        $response = fgets($smtp, 1024);
        if (substr($response, 0, 3) != '220') {
            error_log("STARTTLS failed: $response");
            fclose($smtp);
            return false;
        }

        // Enable crypto
        if (!stream_socket_enable_crypto($smtp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            error_log("Failed to enable TLS encryption");
            fclose($smtp);
            return false;
        }

        // Send EHLO again after TLS
        fputs($smtp, "EHLO localhost\r\n");
        $response = fgets($smtp, 1024);
        while (substr($response, 3, 1) == '-') {
            $response = fgets($smtp, 1024);
        }

        // Authenticate
        fputs($smtp, "AUTH LOGIN\r\n");
        $response = fgets($smtp, 1024);

        fputs($smtp, base64_encode($username) . "\r\n");
        $response = fgets($smtp, 1024);

        fputs($smtp, base64_encode($password) . "\r\n");
        $response = fgets($smtp, 1024);

        if (substr($response, 0, 3) != '235') {
            error_log("SMTP Authentication failed: $response");
            fclose($smtp);
            return false;
        }

        // Send email
        fputs($smtp, "MAIL FROM: <" . $from . ">\r\n");
        $response = fgets($smtp, 1024);

        fputs($smtp, "RCPT TO: <" . $to . ">\r\n");
        $response = fgets($smtp, 1024);

        fputs($smtp, "DATA\r\n");
        $response = fgets($smtp, 1024);

        // Build headers
        $headers = "From: " . $fromName . " <" . $from . ">\r\n";
        $headers .= "To: " . $to . "\r\n";
        $headers .= "Subject: " . $subject . "\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-type: text/html; charset=UTF-8\r\n";
        $headers .= "\r\n";

        fputs($smtp, $headers . $message . "\r\n.\r\n");
        $response = fgets($smtp, 1024);

        // Close connection
        fputs($smtp, "QUIT\r\n");
        fclose($smtp);

        if (substr($response, 0, 3) == '250') {
            error_log("Email sent successfully to $to");
            return true;
        } else {
            error_log("Email send failed: $response");
            return false;
        }

    } catch (Exception $e) {
        error_log("SMTP Error: " . $e->getMessage());
        return false;
    }
}

// Forgot password request
function forgotPassword()
{
    global $pdo;

    error_log("=== forgotPassword() called ===");

    $email = $_POST['email'] ?? '';
    error_log("Email received: $email");

    if (empty($email)) {
        error_log("Email is empty");
        echo json_encode(['error' => 'Email is required']);
        return;
    }

    // Validate email format
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        error_log("Email format invalid: $email");
        echo json_encode(['error' => 'Invalid email format']);
        return;
    }

    $stmt = $pdo->prepare("SELECT id, full_name FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        error_log("User not found for email: $email");
        // For security, don't reveal if email exists
        echo json_encode(['success' => true, 'message' => 'If an account exists with this email, a reset link has been sent.']);
        return;
    }

    error_log("User found: " . $user['full_name']);

    // Generate reset token (URL-safe random string)
    $resetToken = bin2hex(random_bytes(32));

    // Use database time instead of PHP time to avoid timezone mismatches
    // Create expiry using configurable RESET_TOKEN_EXPIRY_MINUTES from .env
    $expiryStmt = $pdo->query("SELECT DATE_ADD(NOW(), INTERVAL " . RESET_TOKEN_EXPIRY_MINUTES . " MINUTE) as expiry");
    $expiryRow = $expiryStmt->fetch(PDO::FETCH_ASSOC);
    $resetTokenExpiry = $expiryRow['expiry'];

    error_log("Generated token expiry: $resetTokenExpiry");

    // Store token in database
    $updateStmt = $pdo->prepare("UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?");
    $updateResult = $updateStmt->execute([$resetToken, $resetTokenExpiry, $user['id']]);

    if (!$updateResult) {
        error_log("Failed to update token in database!");
        echo json_encode(['error' => 'Failed to save reset token. Please try again.']);
        return;
    }

    error_log("Token saved to database");

    // Send reset email
    $resetLink = APP_URL . '/reset-password.php?token=' . $resetToken;
    $emailSent = sendPasswordResetEmail($email, $user['full_name'], $resetLink);

    error_log("sendPasswordResetEmail returned: " . ($emailSent ? 'true' : 'false'));

    if ($emailSent) {
        error_log("Returning success response");
        echo json_encode([
            'success' => true,
            'message' => 'If an account exists with this email, a reset link has been sent.'
        ]);
    } else {
        error_log("Returning error response - email not sent");
        echo json_encode([
            'error' => 'Failed to send reset email. Please try again later.'
        ]);
    }
}

// Reset password with token
function resetPassword()
{
    global $pdo;

    $token = $_POST['token'] ?? '';
    $newPassword = $_POST['password'] ?? '';

    if (empty($token) || empty($newPassword)) {
        echo json_encode(['error' => 'Token and password are required']);
        return;
    }

    // Validate password strength
    if (strlen($newPassword) < 8) {
        echo json_encode(['error' => 'Password must be at least 8 characters long']);
        return;
    }

    if (!preg_match('/[A-Z]/', $newPassword)) {
        echo json_encode(['error' => 'Password must contain at least one uppercase letter']);
        return;
    }

    if (!preg_match('/[0-9]/', $newPassword)) {
        echo json_encode(['error' => 'Password must contain at least one number']);
        return;
    }

    // Find user with valid reset token
    $stmt = $pdo->prepare("SELECT id FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()");
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode(['error' => 'Invalid or expired reset link']);
        return;
    }

    // Hash new password
    $hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);

    // Update password and clear reset token
    $updateStmt = $pdo->prepare("UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?");
    $updateStmt->execute([$hashedPassword, $user['id']]);

    echo json_encode([
        'success' => true,
        'message' => 'Password reset successfully! You can now login with your new password.'
    ]);
}

// Send password reset email
function sendPasswordResetEmail($email, $fullName, $resetLink)
{
    $to = $email;
    $subject = "Password Reset Link - " . APP_NAME;

    $message = "
    <html>
    <head>
        <title>Password Reset</title>
    </head>
    <body>
        <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;'>
            <h2>Password Reset Request</h2>
            <p>Hi " . htmlspecialchars($fullName) . ",</p>
            <p>We received a request to reset your password for your " . htmlspecialchars(APP_NAME) . " account.</p>
            <p style='margin: 30px 0;'>
                <a href='" . htmlspecialchars($resetLink) . "' style='display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;'>Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style='word-break: break-all; color: #666;'>" . htmlspecialchars($resetLink) . "</p>
            <p><strong>Important:</strong> This link will expire in " . RESET_TOKEN_EXPIRY_MINUTES . " minutes. If you did not request a password reset, please ignore this email.</p>
            <hr style='border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;'>
            <p style='color: #666; font-size: 12px;'>" . htmlspecialchars(APP_NAME) . "<br>If you did not request this, you can safely delete this email.</p>
        </div>
    </body>
    </html>
    ";

    // Send via SMTP
    return sendViaSMTP($to, $subject, $message);
}

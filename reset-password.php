<?php
require_once 'config.php';

$token = $_GET['token'] ?? '';
$decodedToken = '';
$isValidToken = false;
$errorMessage = '';

// Validate token if provided
if (!empty($token)) {
    try {
        // Note: PHP automatically URL-decodes GET parameters
        // We don't need to urldecode() it again
        $decodedToken = $token;
        
        // Log for debugging
        error_log("Reset token validation - Token: " . substr($decodedToken, 0, 10) . "... Length: " . strlen($decodedToken));
        error_log("Raw GET token: " . $_GET['token']);
        
        $stmt = $pdo->prepare("SELECT id, email FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()");
        $stmt->execute([$decodedToken]);
        $user = $stmt->fetch();
        
        // Log result
        if ($user) {
            error_log("Token valid for user: " . $user['email']);
            $isValidToken = true;
        } else {
            error_log("Token invalid or expired - checking if token exists...");
            // Try to find if token exists but is expired
            $checkStmt = $pdo->prepare("SELECT id, reset_token_expiry FROM users WHERE reset_token = ?");
            $checkStmt->execute([$decodedToken]);
            $expired = $checkStmt->fetch();
            
            if ($expired) {
                error_log("Token found but expired at: " . $expired['reset_token_expiry']);
                $errorMessage = 'Password reset link has expired. Please request a new password reset.';
            } else {
                error_log("Token not found in database at all");
                // Check all tokens for debugging
                $allTokens = $pdo->query("SELECT id, email, reset_token FROM users WHERE reset_token IS NOT NULL LIMIT 5");
                error_log("Sample tokens in DB: " . json_encode($allTokens->fetchAll()));
                $errorMessage = 'Invalid reset link. Please request a new password reset.';
            }
        }
    } catch (PDOException $e) {
        error_log("Database error: " . $e->getMessage());
        $errorMessage = 'Database error. Please try again later.';
    }
} else {
    $errorMessage = 'No reset token provided.';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Password - Disaster Reporting System</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        :root {
            --primary: #2563eb;
            --primary-dark: #1e40af;
            --danger: #dc2626;
            --success: #10b981;
            --light: #f3f4f6;
            --border: #e5e7eb;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 24px;
            color: var(--primary);
            margin-bottom: 30px;
            font-weight: bold;
        }

        h1 {
            color: #1f2937;
            margin-bottom: 10px;
            font-size: 28px;
        }

        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }

        .alert {
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .alert-error {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fecaca;
        }

        .alert-success {
            background: #dcfce7;
            color: #166534;
            border: 1px solid #bbf7d0;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: #374151;
            font-weight: 500;
            font-size: 14px;
        }

        input {
            width: 100%;
            padding: 12px;
            border: 1px solid var(--border);
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s, box-shadow 0.3s;
        }

        input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .password-input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }

        .password-input-wrapper input {
            padding-right: 40px;
        }

        .password-toggle {
            position: absolute;
            right: 12px;
            background: none;
            border: none;
            color: #666;
            cursor: pointer;
            font-size: 14px;
        }

        .password-toggle:hover {
            color: var(--primary);
        }

        small {
            display: block;
            color: #666;
            margin-top: 6px;
            font-size: 13px;
        }

        .btn {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background: var(--primary-dark);
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(37, 99, 235, 0.3);
        }

        .btn-primary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .back-link {
            display: block;
            text-align: center;
            margin-top: 20px;
            color: var(--primary);
            text-decoration: none;
            font-size: 14px;
        }

        .back-link:hover {
            text-decoration: underline;
        }

        .success-message {
            text-align: center;
        }

        .success-icon {
            font-size: 48px;
            color: var(--success);
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <i class="fas fa-shield-alt"></i>
            <span>Disaster Monitor</span>
        </div>

        <?php if (!$isValidToken): ?>
            <div class="alert alert-error">
                <i class="fas fa-exclamation-circle"></i>
                <span><?php echo htmlspecialchars($errorMessage); ?></span>
            </div>
            <a href="index.html" class="back-link"><i class="fas fa-arrow-left"></i> Back to Login</a>
        <?php else: ?>
            <h1>Reset Password</h1>
            <p class="subtitle">Enter your new password below</p>

            <form id="resetForm">
                <input type="hidden" id="resetToken" value="<?php echo htmlspecialchars($decodedToken); ?>">

                <div class="form-group">
                    <label for="password">New Password</label>
                    <div class="password-input-wrapper">
                        <input type="password" id="password" name="password" required>
                        <button type="button" class="password-toggle" data-target="password">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                    <small>At least 8 characters, 1 uppercase letter, 1 number</small>
                </div>

                <div class="form-group">
                    <label for="confirmPassword">Confirm Password</label>
                    <div class="password-input-wrapper">
                        <input type="password" id="confirmPassword" name="confirmPassword" required>
                        <button type="button" class="password-toggle" data-target="confirmPassword">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>

                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-key"></i> Reset Password
                </button>
            </form>

            <div id="successMessage" style="display: none;">
                <div class="success-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h2>Password Reset Successfully!</h2>
                <p style="color: #666; margin: 15px 0;">Your password has been reset. You can now login with your new password.</p>
                <a href="index.html" class="back-link"><i class="fas fa-sign-in-alt"></i> Go to Login</a>
            </div>

            <script>
                // Password toggle visibility
                document.querySelectorAll('.password-toggle').forEach(button => {
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        const target = e.currentTarget.dataset.target;
                        const input = document.getElementById(target);
                        const icon = e.currentTarget.querySelector('i');
                        
                        if (input.type === 'password') {
                            input.type = 'text';
                            icon.classList.remove('fa-eye');
                            icon.classList.add('fa-eye-slash');
                        } else {
                            input.type = 'password';
                            icon.classList.remove('fa-eye-slash');
                            icon.classList.add('fa-eye');
                        }
                    });
                });

                // Form submission
                document.getElementById('resetForm').addEventListener('submit', async (e) => {
                    e.preventDefault();

                    const password = document.getElementById('password').value;
                    const confirmPassword = document.getElementById('confirmPassword').value;
                    const token = document.getElementById('resetToken').value;

                    // Validate passwords match
                    if (password !== confirmPassword) {
                        showAlert('Passwords do not match', 'error');
                        return;
                    }

                    // Validate password strength
                    if (password.length < 8) {
                        showAlert('Password must be at least 8 characters long', 'error');
                        return;
                    }
                    if (!/[A-Z]/.test(password)) {
                        showAlert('Password must contain at least one uppercase letter', 'error');
                        return;
                    }
                    if (!/[0-9]/.test(password)) {
                        showAlert('Password must contain at least one number', 'error');
                        return;
                    }

                    const formData = new FormData();
                    formData.append('action', 'reset-password');
                    formData.append('token', token);
                    formData.append('password', password);

                    try {
                        const response = await fetch('auth.php', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await response.json();

                        if (data.success) {
                            document.getElementById('resetForm').style.display = 'none';
                            document.getElementById('successMessage').style.display = 'block';
                        } else {
                            showAlert(data.error || 'Password reset failed', 'error');
                        }
                    } catch (error) {
                        console.error('Error:', error);
                        showAlert('Failed to reset password. Please try again.', 'error');
                    }
                });

                function showAlert(message, type) {
                    const alertDiv = document.createElement('div');
                    alertDiv.className = 'alert alert-' + type;
                    alertDiv.innerHTML = `
                        <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i>
                        <span>${message}</span>
                    `;
                    
                    const form = document.getElementById('resetForm');
                    form.parentNode.insertBefore(alertDiv, form);
                    
                    setTimeout(() => alertDiv.remove(), 5000);
                }
            </script>
        <?php endif; ?>
    </div>
</body>
</html>

<?php
// Error handling - suppress errors from going to output
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

header('Content-Type: application/json; charset=utf-8');

require_once 'config.php';

// Check if user is admin
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['error' => 'Unauthorized. Admin access only.', 'authenticated' => false]);
    exit;
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';

if (empty($action)) {
    echo json_encode(['error' => 'No action specified']);
    exit;
}

try {
    switch ($action) {
        // User Management
        case 'get_all_users':
            getAllUsers();
            break;
        case 'get_user':
            getUser();
            break;
        case 'create_user':
            createUser();
            break;
        case 'update_user':
            updateUser();
            break;
        case 'delete_user':
            deleteUser();
            break;
        case 'change_user_role':
            changeUserRole();
            break;

        // Incident Management
        case 'get_all_incidents':
            getAllIncidents();
            break;
        case 'get_incident':
            getIncident();
            break;
        case 'update_incident':
            updateIncident();
            break;
        case 'delete_incident':
            deleteIncident();
            break;
        case 'get_incident_stats':
            getIncidentStats();
            break;

        // Dashboard Stats
        case 'get_dashboard_stats':
            getDashboardStats();
            break;

        default:
            echo json_encode(['error' => 'Invalid action']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}

// User Management Functions
function getAllUsers()
{
    global $pdo;

    $page = $_GET['page'] ?? 1;
    $limit = 10;
    $offset = ($page - 1) * $limit;
    $search = $_GET['search'] ?? '';

    $query = "SELECT id, email, full_name, role, is_active, created_at FROM users";
    $countQuery = "SELECT COUNT(*) as total FROM users";

    if (!empty($search)) {
        $searchTerm = "%$search%";
        $query .= " WHERE email LIKE ? OR full_name LIKE ?";
        $countQuery .= " WHERE email LIKE ? OR full_name LIKE ?";
    }

    $query .= " ORDER BY created_at DESC LIMIT ? OFFSET ?";

    $stmt = $pdo->prepare($query);
    if (!empty($search)) {
        $stmt->execute([$searchTerm, $searchTerm, $limit, $offset]);
    } else {
        $stmt->execute([$limit, $offset]);
    }

    $users = $stmt->fetchAll();

    // Get total count
    $countStmt = $pdo->prepare($countQuery);
    if (!empty($search)) {
        $countStmt->execute([$searchTerm, $searchTerm]);
    } else {
        $countStmt->execute();
    }
    $total = $countStmt->fetch()['total'];

    echo json_encode([
        'success' => true,
        'users' => $users,
        'total' => $total,
        'pages' => ceil($total / $limit),
        'current_page' => $page
    ]);
}

function getUser()
{
    global $pdo;

    $user_id = $_GET['user_id'] ?? 0;

    $stmt = $pdo->prepare("SELECT id, email, full_name, role, created_at FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode(['error' => 'User not found']);
        return;
    }

    echo json_encode(['success' => true, 'user' => $user]);
}

function createUser()
{
    global $pdo;

    $email = $_POST['email'] ?? '';
    $password = $_POST['password'] ?? '';
    $full_name = $_POST['full_name'] ?? '';
    $role = $_POST['role'] ?? 'user';

    if (empty($email) || empty($password) || empty($full_name)) {
        echo json_encode(['error' => 'Email, password, and full name are required']);
        return;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['error' => 'Invalid email format']);
        return;
    }

    if (!in_array($role, ['user', 'barangay', 'admin'])) {
        echo json_encode(['error' => 'Invalid role']);
        return;
    }

    // Check if email exists
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        echo json_encode(['error' => 'Email already exists']);
        return;
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    try {
        $stmt = $pdo->prepare("INSERT INTO users (email, password, full_name, role, is_verified) VALUES (?, ?, ?, ?, 1)");
        $stmt->execute([$email, $hashedPassword, $full_name, $role]);
        $user_id = $pdo->lastInsertId();

        // Log audit trail for user creation
        logAudit('CREATE', 'user', $user_id, null, ['email' => $email, 'full_name' => $full_name, 'role' => $role], 'Admin created new user account');

        echo json_encode(['success' => true, 'message' => 'User created successfully']);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Failed to create user']);
    }
}

function updateUser()
{
    global $pdo;

    $user_id = $_POST['user_id'] ?? 0;
    $full_name = $_POST['full_name'] ?? '';
    $new_role = $_POST['role'] ?? '';
    $new_password = $_POST['password'] ?? '';

    if (empty($user_id)) {
        echo json_encode(['error' => 'User ID is required']);
        return;
    }

    // Prevent changing your own role
    if (!empty($new_role) && $new_role != '' && $user_id == $_SESSION['user_id']) {
        echo json_encode(['error' => 'Cannot change your own role']);
        return;
    }

    try {
        $updateFields = ['full_name = ?'];
        $params = [$full_name];

        if (!empty($new_role) && in_array($new_role, ['user', 'barangay', 'admin'])) {
            $updateFields[] = 'role = ?';
            $params[] = $new_role;
        }

        if (!empty($new_password)) {
            if (strlen($new_password) < 6) {
                echo json_encode(['error' => 'Password must be at least 6 characters']);
                return;
            }
            $updateFields[] = 'password = ?';
            $params[] = password_hash($new_password, PASSWORD_DEFAULT);
        }

        $params[] = $user_id;
        $query = "UPDATE users SET " . implode(", ", $updateFields) . " WHERE id = ?";
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);

        // Log audit trail for user update
        $changes = ['full_name' => $full_name];
        if (!empty($new_role)) {
            $changes['role'] = $new_role;
        }
        if (!empty($new_password)) {
            $changes['password'] = '[CHANGED]';
        }
        logAudit('UPDATE', 'user', $user_id, null, $changes, 'Admin updated user account');

        echo json_encode(['success' => true, 'message' => 'User updated successfully']);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Failed to update user']);
    }
}

function deleteUser()
{
    global $pdo;

    $user_id = $_POST['user_id'] ?? 0;

    if (empty($user_id)) {
        echo json_encode(['error' => 'User ID is required']);
        return;
    }

    // Prevent deleting yourself
    if ($user_id == $_SESSION['user_id']) {
        echo json_encode(['error' => 'Cannot delete your own account']);
        return;
    }

    try {
        // Get user info before deletion for audit log
        $stmt = $pdo->prepare("SELECT email, full_name, role FROM users WHERE id = ?");
        $stmt->execute([$user_id]);
        $user_info = $stmt->fetch(PDO::FETCH_ASSOC);

        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
        $stmt->execute([$user_id]);

        // Log audit trail for user deletion
        logAudit('DELETE', 'user', $user_id, ['email' => $user_info['email'], 'full_name' => $user_info['full_name'], 'role' => $user_info['role']], null, 'Admin deleted user account');

        echo json_encode(['success' => true, 'message' => 'User deleted successfully']);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Failed to delete user']);
    }
}

function changeUserRole()
{
    global $pdo;

    $user_id = $_POST['user_id'] ?? 0;
    $new_role = $_POST['role'] ?? '';

    if (empty($user_id) || empty($new_role)) {
        echo json_encode(['error' => 'User ID and role are required']);
        return;
    }

    if (!in_array($new_role, ['user', 'barangay', 'admin'])) {
        echo json_encode(['error' => 'Invalid role']);
        return;
    }

    // Prevent changing your own role
    if ($user_id == $_SESSION['user_id']) {
        echo json_encode(['error' => 'Cannot change your own role']);
        return;
    }

    try {
        // Get previous role for audit log
        $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
        $stmt->execute([$user_id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        $old_role = $user['role'];

        $stmt = $pdo->prepare("UPDATE users SET role = ? WHERE id = ?");
        $stmt->execute([$new_role, $user_id]);

        // Log audit trail for role change
        logAudit('ROLE_CHANGE', 'user', $user_id, ['old_role' => $old_role], ['new_role' => $new_role], "Admin changed user role from {$old_role} to {$new_role}");

        echo json_encode(['success' => true, 'message' => 'User role changed successfully']);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Failed to change user role']);
    }
}

// Incident Management Functions
function getAllIncidents()
{
    global $pdo;

    $page = $_GET['page'] ?? 1;
    $limit = $_GET['limit'] ?? 10;
    $limit = intval($limit);
    if ($limit > 100)
        $limit = 100; // Max limit for safety
    if ($limit < 1)
        $limit = 10;

    $offset = ($page - 1) * $limit;
    $status = $_GET['status'] ?? '';
    $disaster_type = $_GET['disaster_type'] ?? '';

    $query = "SELECT i.id, i.disaster_type, i.title, i.status, i.severity, i.created_at, u.full_name, u.email 
              FROM incidents i 
              JOIN users u ON i.user_id = u.id";

    $countQuery = "SELECT COUNT(*) as total FROM incidents i JOIN users u ON i.user_id = u.id";

    $conditions = [];
    $params = [];

    if (!empty($status)) {
        $conditions[] = "i.status = ?";
        $params[] = $status;
    }

    if (!empty($disaster_type)) {
        $conditions[] = "i.disaster_type = ?";
        $params[] = $disaster_type;
    }

    if (!empty($conditions)) {
        $where = " WHERE " . implode(" AND ", $conditions);
        $query .= $where;
        $countQuery .= $where;
    }

    $query .= " ORDER BY i.created_at DESC LIMIT ? OFFSET ?";
    $params[] = $limit;
    $params[] = $offset;

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $incidents = $stmt->fetchAll();

    // Get total count
    $countStmt = $pdo->prepare($countQuery);
    $countParams = array_slice($params, 0, -2);
    $countStmt->execute($countParams);
    $total = $countStmt->fetch()['total'];

    echo json_encode([
        'success' => true,
        'incidents' => $incidents,
        'total' => $total,
        'pages' => ceil($total / $limit),
        'current_page' => $page
    ]);
}

function getIncident()
{
    global $pdo;

    $incident_id = $_GET['incident_id'] ?? 0;

    if (empty($incident_id)) {
        echo json_encode(['error' => 'Incident ID is required']);
        return;
    }

    $stmt = $pdo->prepare("SELECT id, disaster_type, title, description, status, severity, latitude, longitude, created_at, user_id FROM incidents WHERE id = ?");
    $stmt->execute([$incident_id]);
    $incident = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$incident) {
        echo json_encode(['error' => 'Incident not found']);
        return;
    }

    echo json_encode(['success' => true, 'incident' => $incident]);
}

function updateIncident()
{
    global $pdo;

    $incident_id = $_POST['incident_id'] ?? 0;
    $title = $_POST['title'] ?? '';
    $description = $_POST['description'] ?? '';
    $status = $_POST['status'] ?? '';
    $severity = $_POST['severity'] ?? '';
    $disaster_type = $_POST['disaster_type'] ?? '';

    if (empty($incident_id)) {
        echo json_encode(['error' => 'Incident ID is required']);
        return;
    }

    // Validate status
    $valid_statuses = ['reported', 'responding', 'in_area', 'resolved'];
    if (!empty($status) && !in_array($status, $valid_statuses)) {
        echo json_encode(['error' => 'Invalid status']);
        return;
    }

    // Validate severity
    $valid_severities = ['low', 'medium', 'high', 'critical'];
    if (!empty($severity) && !in_array($severity, $valid_severities)) {
        echo json_encode(['error' => 'Invalid severity']);
        return;
    }

    try {
        // Get old incident details for audit log
        $stmt = $pdo->prepare("SELECT id, title, description, status, severity, disaster_type FROM incidents WHERE id = ?");
        $stmt->execute([$incident_id]);
        $old_incident = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$old_incident) {
            echo json_encode(['error' => 'Incident not found']);
            return;
        }

        $updateFields = [];
        $params = [];

        if (!empty($title)) {
            $updateFields[] = 'title = ?';
            $params[] = $title;
        }

        if (!empty($description)) {
            $updateFields[] = 'description = ?';
            $params[] = $description;
        }

        if (!empty($status)) {
            $updateFields[] = 'status = ?';
            $params[] = $status;
        }

        if (!empty($severity)) {
            $updateFields[] = 'severity = ?';
            $params[] = $severity;
        }

        if (!empty($disaster_type)) {
            $updateFields[] = 'disaster_type = ?';
            $params[] = $disaster_type;
        }

        if (empty($updateFields)) {
            echo json_encode(['error' => 'No fields to update']);
            return;
        }

        $params[] = $incident_id;
        $query = "UPDATE incidents SET " . implode(", ", $updateFields) . " WHERE id = ?";
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);

        // Log audit trail for incident update - use UPDATE action, not DELETE
        $changes = [];
        if (!empty($title) && $title !== $old_incident['title']) {
            $changes['title'] = $title;
        }
        if (!empty($description) && $description !== $old_incident['description']) {
            $changes['description'] = $description;
        }
        if (!empty($status) && $status !== $old_incident['status']) {
            $changes['status'] = $status;
        }
        if (!empty($severity) && $severity !== $old_incident['severity']) {
            $changes['severity'] = $severity;
        }
        if (!empty($disaster_type) && $disaster_type !== $old_incident['disaster_type']) {
            $changes['disaster_type'] = $disaster_type;
        }

        if (!empty($changes)) {
            logAudit('UPDATE', 'incident', $incident_id, null, $changes, 'Admin updated incident details');
        }

        echo json_encode(['success' => true, 'message' => 'Incident updated successfully']);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Failed to update incident']);
    }
}

function deleteIncident()
{
    global $pdo;

    $incident_id = $_POST['incident_id'] ?? 0;

    if (empty($incident_id)) {
        echo json_encode(['error' => 'Incident ID is required']);
        return;
    }

    try {
        // Get incident info before deletion for audit log
        $stmt = $pdo->prepare("SELECT id, title, disaster_type, status FROM incidents WHERE id = ?");
        $stmt->execute([$incident_id]);
        $incident_info = $stmt->fetch(PDO::FETCH_ASSOC);

        $stmt = $pdo->prepare("DELETE FROM incidents WHERE id = ?");
        $stmt->execute([$incident_id]);

        // Log audit trail for incident deletion
        logAudit('DELETE', 'incident', $incident_id, ['title' => $incident_info['title'], 'disaster_type' => $incident_info['disaster_type'], 'status' => $incident_info['status']], null, 'Admin deleted incident');

        echo json_encode(['success' => true, 'message' => 'Incident deleted successfully']);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Failed to delete incident']);
    }
}

function getIncidentStats()
{
    global $pdo;

    // Get incidents by status
    $stmt = $pdo->prepare("SELECT status, COUNT(*) as count FROM incidents GROUP BY status");
    $stmt->execute();
    $statusStats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

    // Get incidents by disaster type
    $stmt = $pdo->prepare("SELECT disaster_type, COUNT(*) as count FROM incidents GROUP BY disaster_type");
    $stmt->execute();
    $disasterStats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

    // Get incidents by severity
    $stmt = $pdo->prepare("SELECT COALESCE(severity, 'unset') as severity, COUNT(*) as count FROM incidents GROUP BY severity");
    $stmt->execute();
    $severityStats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

    echo json_encode([
        'success' => true,
        'status_stats' => $statusStats,
        'disaster_stats' => $disasterStats,
        'severity_stats' => $severityStats
    ]);
}

// Dashboard Stats
function getDashboardStats()
{
    global $pdo;

    // Total users
    $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM users");
    $stmt->execute();
    $totalUsers = $stmt->fetch()['count'];

    // Users by role
    $stmt = $pdo->prepare("SELECT role, COUNT(*) as count FROM users GROUP BY role");
    $stmt->execute();
    $usersByRole = array_column($stmt->fetchAll(), 'count', 'role');

    // Total incidents
    $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM incidents");
    $stmt->execute();
    $totalIncidents = $stmt->fetch()['count'];

    // Active incidents (not resolved)
    $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM incidents WHERE status != 'resolved'");
    $stmt->execute();
    $activeIncidents = $stmt->fetch()['count'];

    // Recent incidents (last 7 days)
    $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM incidents WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
    $stmt->execute();
    $recentIncidents = $stmt->fetch()['count'];

    // Incidents by status
    $stmt = $pdo->prepare("SELECT status, COUNT(*) as count FROM incidents GROUP BY status");
    $stmt->execute();
    $incidentsByStatus = array_column($stmt->fetchAll(), 'count', 'status');

    // Deactivated accounts
    $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM users WHERE is_active = 0");
    $stmt->execute();
    $deactivatedAccounts = $stmt->fetch()['count'];

    // Unverified accounts
    $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM users WHERE is_verified = 0");
    $stmt->execute();
    $unverifiedAccounts = $stmt->fetch()['count'];

    echo json_encode([
        'success' => true,
        'total_users' => $totalUsers,
        'users_by_role' => $usersByRole,
        'total_incidents' => $totalIncidents,
        'active_incidents' => $activeIncidents,
        'recent_incidents' => $recentIncidents,
        'incidents_by_status' => $incidentsByStatus,
        'deactivated_accounts' => $deactivatedAccounts,
        'unverified_accounts' => $unverifiedAccounts
    ]);
}



// Audit logging function (copied from api.php to avoid circular includes)
function logAudit($action_type, $entity_type, $entity_id, $old_value = null, $new_value = null, $details = '', $image_path = '')
{
    global $pdo;

    $user_id = isset($_SESSION['user_id']) ? $_SESSION['user_id'] : null;
    $ip_address = $_SERVER['REMOTE_ADDR'] ?? '';
    $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? '';

    try {
        $stmt = $pdo->prepare("
            INSERT INTO audit_logs (
                user_id, 
                action_type, 
                entity_type, 
                entity_id, 
                old_value, 
                new_value, 
                details, 
                image_path, 
                ip_address, 
                user_agent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            $user_id,
            $action_type,
            $entity_type,
            $entity_id,
            $old_value ? json_encode($old_value) : null,
            $new_value ? json_encode($new_value) : null,
            $details,
            $image_path,
            $ip_address,
            $user_agent
        ]);

        return true;
    } catch (PDOException $e) {
        error_log('Audit logging error: ' . $e->getMessage());
        return false;
    }
}

?>

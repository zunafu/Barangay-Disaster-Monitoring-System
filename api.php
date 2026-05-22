<?php
require_once 'config.php';

header('Content-Type: application/json');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'get_config':
        getConfig();
        break;
    case 'get_incidents':
        getIncidents();
        break;
    case 'create_incident':
        createIncident();
        break;
    case 'get_incident':
        getIncident();
        break;
    case 'confirm_incident':
        confirmIncident();
        break;
    case 'add_comment':
        addComment();
        break;
    case 'get_comments':
        getComments();
        break;
    case 'update_status':
        updateStatus();
        break;
    case 'update_severity':
        updateSeverity();
        break;
    case 'react_comment':
        reactToComment();
        break;
    case 'create_chat_message':
        createChatMessage();
        break;
    case 'get_chat_messages':
        getChatMessages();
        break;
    case 'react_chat_message':
        reactChatMessage();
        break;
    case 'delete_comment':
        deleteComment();
        break;
    case 'create_announcement':
        createAnnouncement();
        break;
    case 'get_announcements':
        getAnnouncements();
        break;
    case 'create_announcement_comment':
        createAnnouncementComment();
        break;
    case 'react_announcement_comment':
        reactAnnouncementComment();
        break;
    case 'delete_announcement_comment':
        deleteAnnouncementComment();
        break;
    case 'delete_chat_message':
        deleteChatMessage();
        break;
    case 'edit_chat_message':
        editChatMessage();
        break;
    case 'get_audit_logs':
        getAuditLogs();
        break;
    case 'get_users':
        getUsers();
        break;
    case 'deactivate_user':
        deactivateUser();
        break;
    case 'reactivate_user':
        reactivateUser();
        break;

    default:
        echo json_encode(['error' => 'Invalid action']);
}

// Get config (API keys etc)
function getConfig()
{
    echo json_encode([
        'GEOAPIFY_API_KEY' => GEOAPIFY_API_KEY
    ]);
}

function reactToComment()
{
    global $pdo;

    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $comment_id = $_POST['comment_id'] ?? 0;
    $reaction = $_POST['reaction'] ?? ''; // 'like' or 'dislike'

    if (!in_array($reaction, ['like', 'dislike'])) {
        echo json_encode(['error' => 'Invalid reaction']);
        return;
    }

    // Check if user already reacted
    $stmt = $pdo->prepare("SELECT id, reaction FROM comment_reactions WHERE comment_id = ? AND user_id = ?");
    $stmt->execute([$comment_id, $_SESSION['user_id']]);
    $existing = $stmt->fetch();

    if ($existing) {
        if ($existing['reaction'] === $reaction) {
            // Same reaction - remove it (toggle off)
            $stmt = $pdo->prepare("DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ?");
            $stmt->execute([$comment_id, $_SESSION['user_id']]);
            $newReaction = null;
        } else {
            // Different reaction - update it
            $stmt = $pdo->prepare("UPDATE comment_reactions SET reaction = ? WHERE comment_id = ? AND user_id = ?");
            $stmt->execute([$reaction, $comment_id, $_SESSION['user_id']]);
            $newReaction = $reaction;
        }
    } else {
        // No reaction yet - insert new
        $stmt = $pdo->prepare("INSERT INTO comment_reactions (comment_id, user_id, reaction) VALUES (?, ?, ?)");
        $stmt->execute([$comment_id, $_SESSION['user_id'], $reaction]);
        $newReaction = $reaction;
    }

    // Get updated counts
    $stmt = $pdo->prepare("
        SELECT 
            (SELECT COUNT(*) FROM comment_reactions WHERE comment_id = ? AND reaction = 'like') as likes,
            (SELECT COUNT(*) FROM comment_reactions WHERE comment_id = ? AND reaction = 'dislike') as dislikes
    ");
    $stmt->execute([$comment_id, $comment_id]);
    $counts = $stmt->fetch();

    echo json_encode([
        'success' => true,
        'likes' => $counts['likes'],
        'dislikes' => $counts['dislikes'],
        'user_reaction' => $newReaction
    ]);
}

function getIncidents()
{
    global $pdo;

    $stmt = $pdo->query("
        SELECT i.*, u.full_name as reporter_name, u.role as reporter_role, u.profile_picture as reporter_profile_picture,
               (SELECT COUNT(*) FROM confirmations WHERE incident_id = i.id) as confirmation_count,
               (SELECT COUNT(*) FROM confirmations WHERE incident_id = i.id AND user_id = " . (isLoggedIn() ? $_SESSION['user_id'] : 0) . ") as user_confirmed
        FROM incidents i
        JOIN users u ON i.user_id = u.id
        ORDER BY i.created_at DESC
    ");

    $incidents = $stmt->fetchAll();

    echo json_encode($incidents);
}

function createIncident()
{
    global $pdo;

    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $disaster_type = $_POST['disaster_type'] ?? '';
    $title = $_POST['title'] ?? '';
    $description = $_POST['description'] ?? '';
    $latitude = $_POST['latitude'] ?? '';
    $longitude = $_POST['longitude'] ?? '';
    $address = $_POST['address'] ?? '';
    $severity = $_POST['severity'] ?? null;

    // User role cannot set severity - it remains NULL until barangay/admin sets it
    if ($_SESSION['role'] === 'user') {
        $severity = null;
    }

    if (empty($disaster_type) || empty($title) || empty($description) || empty($latitude) || empty($longitude)) {
        echo json_encode(['error' => 'All fields are required']);
        return;
    }

    // Handle image upload
    $imagePath = null;
    if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $uploadDir = 'uploads/';
        if (!file_exists($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $extension = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
        $filename = uniqid() . '_' . time() . '.' . $extension;
        $imagePath = $uploadDir . $filename;

        if (!move_uploaded_file($_FILES['image']['tmp_name'], $imagePath)) {
            $imagePath = null;
        }
    }

    $stmt = $pdo->prepare("
        /* Force default status to 'reported' on create */
        INSERT INTO incidents (user_id, disaster_type, title, description, latitude, longitude, address, image_path, severity, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reported')
    ");

    try {
        $stmt->execute([
            $_SESSION['user_id'],
            $disaster_type,
            $title,
            $description,
            $latitude,
            $longitude,
            $address,
            $imagePath,
            $severity
        ]);

        $incidentId = $pdo->lastInsertId();

        // Get the created incident
        $stmt = $pdo->prepare("
            SELECT i.*, u.full_name as reporter_name, u.role as reporter_role,
                   (SELECT COUNT(*) FROM confirmations WHERE incident_id = i.id) as confirmation_count
            FROM incidents i
            JOIN users u ON i.user_id = u.id
            WHERE i.id = ?
        ");
        $stmt->execute([$incidentId]);
        $incident = $stmt->fetch();

        // Log incident creation
        logAudit('CREATE', 'incident', $incidentId, null, [
            'disaster_type' => $disaster_type,
            'title' => $title,
            'address' => $address,
            'severity' => $severity ?? 'Unassigned',
            'status' => 'reported'
        ], 'Disaster incident reported: ' . $title, $imagePath);

        echo json_encode(['success' => true, 'incident' => $incident]);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to create incident: ' . $e->getMessage()]);
    }
}

function getIncident()
{
    global $pdo;

    $id = $_GET['id'] ?? 0;

    $stmt = $pdo->prepare("
        SELECT i.*, u.full_name as reporter_name, u.role as reporter_role, u.profile_picture as reporter_profile_picture,
               (SELECT COUNT(*) FROM confirmations WHERE incident_id = i.id) as confirmation_count
        FROM incidents i
        JOIN users u ON i.user_id = u.id
        WHERE i.id = ?
    ");
    $stmt->execute([$id]);
    $incident = $stmt->fetch();

    if ($incident) {
        // Check if current user has confirmed this incident
        if (isLoggedIn()) {
            $stmt = $pdo->prepare("SELECT id FROM confirmations WHERE incident_id = ? AND user_id = ?");
            $stmt->execute([$id, $_SESSION['user_id']]);
            $incident['user_confirmed'] = $stmt->fetch() ? true : false;
        } else {
            $incident['user_confirmed'] = false;
        }

        echo json_encode($incident);
    } else {
        echo json_encode(['error' => 'Incident not found']);
    }
}

function confirmIncident()
{
    global $pdo;

    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $incident_id = intval($_POST['incident_id'] ?? 0);

    if ($incident_id <= 0) {
        echo json_encode(['error' => 'Invalid incident ID']);
        return;
    }

    // Check if already confirmed
    $stmt = $pdo->prepare("SELECT id FROM confirmations WHERE incident_id = ? AND user_id = ?");
    if (!$stmt->execute([$incident_id, $_SESSION['user_id']])) {
        echo json_encode(['error' => 'Database error: ' . $pdo->errorInfo()[2]]);
        return;
    }

    if ($stmt->fetch()) {
        // Already confirmed - prevent unconfirming
        echo json_encode([
            'error' => 'You have already confirmed this incident. Confirmations cannot be undone.',
            'confirmed' => true
        ]);
    } else {
        // Not confirmed yet - add confirmation
        $stmt = $pdo->prepare("INSERT INTO confirmations (incident_id, user_id) VALUES (?, ?)");

        try {
            if (!$stmt->execute([$incident_id, $_SESSION['user_id']])) {
                echo json_encode(['error' => 'Database error: ' . $pdo->errorInfo()[2]]);
                return;
            }

            logAudit('CONFIRM', 'incident', $incident_id, null, null, 'User confirmed incident');

            // Get updated count
            $countStmt = $pdo->prepare("SELECT COUNT(*) as count FROM confirmations WHERE incident_id = ?");
            $countStmt->execute([$incident_id]);
            $result = $countStmt->fetch();

            echo json_encode([
                'success' => true,
                'confirmed' => true,
                'confirmation_count' => $result['count']
            ]);
        } catch (PDOException $e) {
            echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
        }
    }
}

function addComment()
{
    global $pdo;

    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $incident_id = $_POST['incident_id'] ?? 0;
    $comment = $_POST['comment'] ?? '';
    $parent_comment_id = $_POST['parent_comment_id'] ?? null;

    if (empty($comment)) {
        echo json_encode(['error' => 'Comment cannot be empty']);
        return;
    }

    $stmt = $pdo->prepare("INSERT INTO comments (incident_id, user_id, parent_comment_id, comment) VALUES (?, ?, ?, ?)");

    try {
        $stmt->execute([$incident_id, $_SESSION['user_id'], $parent_comment_id, $comment]);
        $commentId = $pdo->lastInsertId();

        // Get the created comment
        $stmt = $pdo->prepare("
            SELECT c.*, u.full_name, u.role, u.profile_picture,
                   (SELECT COUNT(*) FROM comment_reactions WHERE comment_id = c.id AND reaction = 'like') as likes,
                   (SELECT COUNT(*) FROM comment_reactions WHERE comment_id = c.id AND reaction = 'dislike') as dislikes
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        ");
        $stmt->execute([$commentId]);
        $newComment = $stmt->fetch();

        // Check user's reaction
        if (isLoggedIn()) {
            $stmt = $pdo->prepare("SELECT reaction FROM comment_reactions WHERE comment_id = ? AND user_id = ?");
            $stmt->execute([$newComment['id'], $_SESSION['user_id']]);
            $reaction = $stmt->fetch();
            $newComment['user_reaction'] = $reaction ? $reaction['reaction'] : null;
        }

        // Log comment creation
        logAudit(
            'CREATE',
            'comment',
            $commentId,
            null,
            ['incident_id' => $incident_id, 'text' => substr($comment, 0, 100)],
            'Comment added on incident #' . $incident_id
        );

        echo json_encode(['success' => true, 'comment' => $newComment]);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to add comment']);
    }
}

function getComments()
{
    global $pdo;

    $incident_id = $_GET['incident_id'] ?? 0;

    $stmt = $pdo->prepare("
        SELECT c.*, u.full_name, u.role, u.profile_picture,
               (SELECT COUNT(*) FROM comment_reactions WHERE comment_id = c.id AND reaction = 'like') as likes,
               (SELECT COUNT(*) FROM comment_reactions WHERE comment_id = c.id AND reaction = 'dislike') as dislikes
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.incident_id = ?
        ORDER BY c.created_at ASC
    ");
    $stmt->execute([$incident_id]);
    $comments = $stmt->fetchAll();

    // Check user's reactions for each comment
    if (isLoggedIn()) {
        foreach ($comments as &$comment) {
            $stmt = $pdo->prepare("SELECT reaction FROM comment_reactions WHERE comment_id = ? AND user_id = ?");
            $stmt->execute([$comment['id'], $_SESSION['user_id']]);
            $reaction = $stmt->fetch();
            $comment['user_reaction'] = $reaction ? $reaction['reaction'] : null;
        }
    } else {
        foreach ($comments as &$comment) {
            $comment['user_reaction'] = null;
        }
    }

    echo json_encode($comments);
}

function updateStatus()
{
    global $pdo;

    if (!isLoggedIn() || !in_array($_SESSION['role'], ['barangay', 'admin'])) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $incident_id = $_POST['incident_id'] ?? 0;
    $status = $_POST['status'] ?? '';

    if (!in_array($status, ['reported', 'responding', 'in_area', 'resolved'])) {
        echo json_encode(['error' => 'Invalid status']);
        return;
    }

    // Get incident details before update
    $stmt = $pdo->prepare("SELECT * FROM incidents WHERE id = ?");
    $stmt->execute([$incident_id]);
    $oldIncident = $stmt->fetch();

    if ($status === 'resolved') {
        // Log resolution before deleting
        logAudit(
            'UPDATE',
            'incident',
            $incident_id,
            ['status' => $oldIncident['status']],
            ['status' => 'resolved'],
            'Incident resolved by ' . $_SESSION['full_name'] . ' (' . $_SESSION['role'] . ')',
            $oldIncident['image_path']
        );

        $stmt = $pdo->prepare("DELETE FROM incidents WHERE id = ?");

        try {
            $stmt->execute([$incident_id]);
            echo json_encode(['success' => true, 'deleted' => true, 'message' => 'Incident resolved and removed']);
        } catch (PDOException $e) {
            echo json_encode(['error' => 'Failed to delete incident']);
        }
    } else {
        // Update status for reported/responding/in_area
        if ($status === 'in_area') {
            $stmt = $pdo->prepare("UPDATE incidents SET status = ?, eta_at = NULL WHERE id = ?");
            try {
                $stmt->execute([$status, $incident_id]);

                // Log status update
                logAudit(
                    'UPDATE',
                    'incident',
                    $incident_id,
                    ['status' => $oldIncident['status']],
                    ['status' => $status],
                    'Incident status updated to "in_area"',
                    $oldIncident['image_path']
                );

                echo json_encode(['success' => true, 'deleted' => false]);
            } catch (PDOException $e) {
                echo json_encode(['error' => 'Failed to update status']);
            }
        } elseif ($status === 'reported') {
            // allow manual reset to reported (does not touch ETA)
            $stmt = $pdo->prepare("UPDATE incidents SET status = ? WHERE id = ?");
            try {
                $stmt->execute([$status, $incident_id]);

                // Log status update
                logAudit(
                    'UPDATE',
                    'incident',
                    $incident_id,
                    ['status' => $oldIncident['status']],
                    ['status' => $status],
                    'Incident status reset to "reported"',
                    $oldIncident['image_path']
                );

                echo json_encode(['success' => true, 'deleted' => false]);
            } catch (PDOException $e) {
                echo json_encode(['error' => 'Failed to update status']);
            }
        } else {
            $stmt = $pdo->prepare("UPDATE incidents SET status = ? WHERE id = ?");
            try {
                $stmt->execute([$status, $incident_id]);

                // Log status update
                logAudit(
                    'UPDATE',
                    'incident',
                    $incident_id,
                    ['status' => $oldIncident['status']],
                    ['status' => $status],
                    'Incident status updated to "' . $status . '"',
                    $oldIncident['image_path']
                );

                echo json_encode(['success' => true, 'deleted' => false]);
            } catch (PDOException $e) {
                echo json_encode(['error' => 'Failed to update status']);
            }
        }
    }
}

function updateSeverity()
{
    global $pdo;

    if (!isLoggedIn() || !in_array($_SESSION['role'], ['barangay', 'admin'])) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $incident_id = $_POST['incident_id'] ?? 0;
    $severity = $_POST['severity'] ?? '';

    // Allow 'none' to clear severity, or any valid severity level
    if (!in_array($severity, ['none', 'low', 'medium', 'high', 'critical'])) {
        echo json_encode(['error' => 'Invalid severity']);
        return;
    }

    // Get incident details before update
    $stmt = $pdo->prepare("SELECT * FROM incidents WHERE id = ?");
    $stmt->execute([$incident_id]);
    $oldIncident = $stmt->fetch();

    // Convert 'none' to NULL in database
    $severityValue = ($severity === 'none') ? null : $severity;

    $stmt = $pdo->prepare("UPDATE incidents SET severity = ? WHERE id = ?");
    try {
        $stmt->execute([$severityValue, $incident_id]);

        // Log severity update
        logAudit(
            'UPDATE',
            'incident',
            $incident_id,
            ['severity' => $oldIncident['severity'] ?? 'none'],
            ['severity' => $severity],
            'Incident severity updated to "' . $severity . '" by ' . $_SESSION['full_name'],
            $oldIncident['image_path']
        );

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to update severity']);
    }
}

/* ETA functionality removed */

/* Chat endpoints implementation */
function createChatMessage()
{
    global $pdo;
    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $message = trim($_POST['message'] ?? '');
    $parent = $_POST['parent_message_id'] ?? null;

    if ($message === '') {
        echo json_encode(['error' => 'Message cannot be empty']);
        return;
    }

    $stmt = $pdo->prepare("INSERT INTO chat_messages (user_id, parent_message_id, message) VALUES (?, ?, ?)");
    try {
        $stmt->execute([$_SESSION['user_id'], $parent, $message]);
        $id = $pdo->lastInsertId();

        logAudit('CREATE', 'chat_message', $id, null, ['message' => $message], 'Chat message created');

        $stmt = $pdo->prepare("SELECT c.*, u.full_name as author_name, u.role as author_role, u.profile_picture as author_profile_picture FROM chat_messages c JOIN users u ON c.user_id = u.id WHERE c.id = ?");
        $stmt->execute([$id]);
        $msg = $stmt->fetch();
        echo json_encode(['success' => true, 'message' => $msg]);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to post message']);
    }
}

function getChatMessages()
{
    global $pdo;
    $user_id = isLoggedIn() ? $_SESSION['user_id'] : 0;
    $stmt = $pdo->prepare("SELECT m.*, u.full_name as author_name, u.role as author_role, u.profile_picture as author_profile_picture,
        (SELECT COUNT(*) FROM chat_message_reactions r WHERE r.message_id = m.id AND r.reaction = 'like') as likes,
        (SELECT COUNT(*) FROM chat_message_reactions r WHERE r.message_id = m.id AND r.reaction = 'dislike') as dislikes,
        (SELECT reaction FROM chat_message_reactions r WHERE r.message_id = m.id AND r.user_id = ?) as user_reaction
        FROM chat_messages m JOIN users u ON m.user_id = u.id WHERE parent_message_id IS NULL ORDER BY m.created_at DESC");
    $stmt->execute([$user_id]);
    $messages = $stmt->fetchAll();

    foreach ($messages as &$m) {
        $stmt = $pdo->prepare("SELECT c.*, u.full_name as author_name, u.role as author_role, u.profile_picture as author_profile_picture,
            (SELECT COUNT(*) FROM chat_message_reactions r WHERE r.message_id = c.id AND r.reaction = 'like') as likes,
            (SELECT COUNT(*) FROM chat_message_reactions r WHERE r.message_id = c.id AND r.reaction = 'dislike') as dislikes,
            (SELECT reaction FROM chat_message_reactions r WHERE r.message_id = c.id AND r.user_id = ?) as user_reaction
            FROM chat_messages c JOIN users u ON c.user_id = u.id WHERE c.parent_message_id = ? ORDER BY c.created_at ASC");
        $stmt->execute([$user_id, $m['id']]);
        $m['replies'] = $stmt->fetchAll();
    }

    echo json_encode($messages);
}

function reactChatMessage()
{
    global $pdo;
    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $message_id = $_POST['message_id'] ?? 0;
    $reaction = $_POST['reaction'] ?? '';
    if (!in_array($reaction, ['like', 'dislike'])) {
        echo json_encode(['error' => 'Invalid reaction']);
        return;
    }

    $stmt = $pdo->prepare("SELECT id, reaction FROM chat_message_reactions WHERE message_id = ? AND user_id = ?");
    $stmt->execute([$message_id, $_SESSION['user_id']]);
    $existing = $stmt->fetch();

    if ($existing) {
        if ($existing['reaction'] === $reaction) {
            $stmt = $pdo->prepare("DELETE FROM chat_message_reactions WHERE id = ?");
            $stmt->execute([$existing['id']]);
        } else {
            $stmt = $pdo->prepare("UPDATE chat_message_reactions SET reaction = ? WHERE id = ?");
            $stmt->execute([$reaction, $existing['id']]);
        }
    } else {
        $stmt = $pdo->prepare("INSERT INTO chat_message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)");
        $stmt->execute([$message_id, $_SESSION['user_id'], $reaction]);
    }

    $stmt = $pdo->prepare("SELECT (SELECT COUNT(*) FROM chat_message_reactions WHERE message_id = ? AND reaction = 'like') as likes,
        (SELECT COUNT(*) FROM chat_message_reactions WHERE message_id = ? AND reaction = 'dislike') as dislikes,
        (SELECT reaction FROM chat_message_reactions WHERE message_id = ? AND user_id = ?) as user_reaction");
    $stmt->execute([$message_id, $message_id, $message_id, $_SESSION['user_id']]);
    $counts = $stmt->fetch();

    echo json_encode(['success' => true, 'likes' => $counts['likes'], 'dislikes' => $counts['dislikes'], 'user_reaction' => $counts['user_reaction']]);
}


function deleteComment()
{
    global $pdo;
    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }
    $comment_id = $_POST['comment_id'] ?? 0;
    $stmt = $pdo->prepare("SELECT user_id, comment, incident_id FROM comments WHERE id = ?");
    $stmt->execute([$comment_id]);
    $comment = $stmt->fetch();
    if (!$comment) {
        echo json_encode(['error' => 'Comment not found']);
        return;
    }
    if ($comment['user_id'] !== $_SESSION['user_id']) {
        echo json_encode(['error' => 'You can only delete your own comments']);
        return;
    }
    try {
        $stmt = $pdo->prepare("DELETE FROM comment_reactions WHERE comment_id = ?");
        $stmt->execute([$comment_id]);
        $stmt = $pdo->prepare("DELETE FROM comments WHERE parent_comment_id = ?");
        $stmt->execute([$comment_id]);
        $stmt = $pdo->prepare("DELETE FROM comments WHERE id = ?");
        $stmt->execute([$comment_id]);

        // Log comment deletion
        logAudit(
            'DELETE',
            'comment',
            $comment_id,
            ['text' => substr($comment['comment'], 0, 100)],
            null,
            'Comment deleted on incident #' . $comment['incident_id']
        );

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to delete comment: ' . $e->getMessage()]);
    }
}

function editChatMessage()
{
    global $pdo;
    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }
    $message_id = $_POST['message_id'] ?? 0;
    $new_message = $_POST['message'] ?? '';

    if (!$new_message) {
        echo json_encode(['error' => 'Message cannot be empty']);
        return;
    }

    $stmt = $pdo->prepare("SELECT user_id, message FROM chat_messages WHERE id = ?");
    $stmt->execute([$message_id]);
    $message = $stmt->fetch();
    if (!$message) {
        echo json_encode(['error' => 'Message not found']);
        return;
    }
    if ($message['user_id'] !== $_SESSION['user_id']) {
        echo json_encode(['error' => 'You can only edit your own messages']);
        return;
    }
    try {
        $old_message = $message['message'];
        $stmt = $pdo->prepare("UPDATE chat_messages SET message = ? WHERE id = ?");
        $stmt->execute([$new_message, $message_id]);

        // Log edit
        logAudit('UPDATE', 'chat_message', $message_id, $old_message, $new_message, 'Chat message edited by owner');

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to edit message']);
    }
}

function deleteChatMessage()
{
    global $pdo;
    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }
    $message_id = $_POST['message_id'] ?? 0;
    $stmt = $pdo->prepare("SELECT user_id FROM chat_messages WHERE id = ?");
    $stmt->execute([$message_id]);
    $message = $stmt->fetch();
    if (!$message) {
        echo json_encode(['error' => 'Message not found']);
        return;
    }
    if ($message['user_id'] !== $_SESSION['user_id']) {
        echo json_encode(['error' => 'You can only delete your own messages']);
        return;
    }
    try {
        $stmt = $pdo->prepare("DELETE FROM chat_message_reactions WHERE message_id = ?");
        $stmt->execute([$message_id]);
        $stmt = $pdo->prepare("DELETE FROM chat_messages WHERE parent_message_id = ?");
        $stmt->execute([$message_id]);
        $stmt = $pdo->prepare("DELETE FROM chat_messages WHERE id = ?");
        $stmt->execute([$message_id]);

        // Log deletion
        logAudit('DELETE', 'chat_message', $message_id, null, null, 'Chat message deleted by owner');

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to delete message']);
    }
}

// ============================================================================
// AUDIT LOGGING FUNCTIONS
// ============================================================================

/**
 * Log audit event to database
 * @param string $action_type - Type of action (CREATE, UPDATE, DELETE, etc)
 * @param string $entity_type - Type of entity affected (incident, user, comment, chat_message)
 * @param int $entity_id - ID of affected entity
 * @param mixed $old_value - Old value (for UPDATE actions)
 * @param mixed $new_value - New value (for UPDATE or CREATE actions)
 * @param string $details - Additional details about the action
 * @param string $image_path - Optional path to image for incident previews
 */
function logAudit($action_type, $entity_type, $entity_id, $old_value = null, $new_value = null, $details = '', $image_path = '')
{
    global $pdo;

    $user_id = isLoggedIn() ? $_SESSION['user_id'] : null;
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
        // Log errors silently to avoid breaking main operations
        error_log('Audit logging error: ' . $e->getMessage());
        return false;
    }
}

/**
 * Get audit logs with filtering and pagination
 */
function getAuditLogs()
{
    global $pdo;

    // Only admins and barangay can view audit logs
    if (!isLoggedIn() || !in_array($_SESSION['role'], ['admin', 'barangay'])) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $action_type = $_GET['action_type'] ?? '';
    $entity_type = $_GET['entity_type'] ?? '';
    $user_id = $_GET['user_id'] ?? '';
    $date_from = $_GET['date_from'] ?? '';
    $date_to = $_GET['date_to'] ?? '';
    $page = (int) ($_GET['page'] ?? 1);
    $limit = (int) ($_GET['limit'] ?? 50);
    $offset = ($page - 1) * $limit;

    // Build query
    $where = ['1=1'];
    $params = [];

    if ($action_type) {
        $where[] = 'action_type = ?';
        $params[] = $action_type;
    }
    if ($entity_type) {
        $where[] = 'entity_type = ?';
        $params[] = $entity_type;
    }
    if ($user_id) {
        $where[] = 'user_id = ?';
        $params[] = (int) $user_id;
    }
    if ($date_from) {
        $where[] = 'DATE(created_at) >= ?';
        $params[] = $date_from;
    }
    if ($date_to) {
        $where[] = 'DATE(created_at) <= ?';
        $params[] = $date_to;
    }

    $whereClause = implode(' AND ', $where);

    // Get total count
    $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM audit_logs WHERE $whereClause");
    $countStmt->execute($params);
    $total = $countStmt->fetch()['total'];

    // Get paginated results
    $stmt = $pdo->prepare("
        SELECT 
            al.id,
            al.user_id,
            al.action_type,
            al.entity_type,
            al.entity_id,
            al.old_value,
            al.new_value,
            al.details,
            al.image_path,
            al.created_at,
            u.full_name as user_name,
            u.role as user_role
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE $whereClause
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?
    ");

    array_push($params, $limit, $offset);
    $stmt->execute($params);
    $logs = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'logs' => $logs,
        'total' => $total,
        'page' => $page,
        'limit' => $limit,
        'pages' => ceil($total / $limit)
    ]);
}

// ============================================================================
// ANNOUNCEMENT FUNCTIONS
// ============================================================================

function createAnnouncement()
{
    global $pdo;

    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    // Only barangay and admin can create announcements
    if (!in_array($_SESSION['role'], ['barangay', 'admin'])) {
        echo json_encode(['error' => 'Only barangay and admin can post announcements']);
        return;
    }

    $title = trim($_POST['title'] ?? '');
    $message = trim($_POST['message'] ?? '');

    if ($title === '' || $message === '') {
        echo json_encode(['error' => 'Title and message cannot be empty']);
        return;
    }

    $stmt = $pdo->prepare("INSERT INTO announcements (user_id, title, message) VALUES (?, ?, ?)");
    try {
        $stmt->execute([$_SESSION['user_id'], $title, $message]);
        $id = $pdo->lastInsertId();

        $stmt = $pdo->prepare("SELECT a.*, u.full_name as author_name, u.role as author_role, u.profile_picture as author_profile_picture FROM announcements a JOIN users u ON a.user_id = u.id WHERE a.id = ?");
        $stmt->execute([$id]);
        $announcement = $stmt->fetch();

        // Log announcement creation
        logAudit('CREATE', 'announcement', $id, null, ['title' => $title], 'Announcement created');

        echo json_encode(['success' => true, 'announcement' => $announcement]);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to create announcement']);
    }
}

function getAnnouncements()
{
    global $pdo;
    $user_id = isLoggedIn() ? $_SESSION['user_id'] : 0;

    $stmt = $pdo->query("SELECT a.*, u.full_name as author_name, u.role as author_role, u.profile_picture as author_profile_picture FROM announcements a JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC");
    $announcements = $stmt->fetchAll();

    foreach ($announcements as &$a) {
        // Get comments for this announcement
        $stmt = $pdo->prepare("SELECT c.*, u.full_name as author_name, u.role as author_role, u.profile_picture as author_profile_picture,
            (SELECT COUNT(*) FROM announcement_comment_reactions r WHERE r.comment_id = c.id AND r.reaction = 'like') as likes,
            (SELECT COUNT(*) FROM announcement_comment_reactions r WHERE r.comment_id = c.id AND r.reaction = 'dislike') as dislikes,
            (SELECT reaction FROM announcement_comment_reactions r WHERE r.comment_id = c.id AND r.user_id = ?) as user_reaction
            FROM announcement_comments c JOIN users u ON c.user_id = u.id WHERE c.announcement_id = ? AND c.parent_comment_id IS NULL ORDER BY c.created_at ASC");
        $stmt->execute([$user_id, $a['id']]);
        $comments = $stmt->fetchAll();

        // Get replies for each comment
        foreach ($comments as &$c) {
            $stmt = $pdo->prepare("SELECT r.*, u.full_name as author_name, u.role as author_role, u.profile_picture as author_profile_picture,
                (SELECT COUNT(*) FROM announcement_comment_reactions react WHERE react.comment_id = r.id AND react.reaction = 'like') as likes,
                (SELECT COUNT(*) FROM announcement_comment_reactions react WHERE react.comment_id = r.id AND react.reaction = 'dislike') as dislikes,
                (SELECT reaction FROM announcement_comment_reactions react WHERE react.comment_id = r.id AND react.user_id = ?) as user_reaction
                FROM announcement_comments r JOIN users u ON r.user_id = u.id WHERE r.parent_comment_id = ? ORDER BY r.created_at ASC");
            $stmt->execute([$user_id, $c['id']]);
            $c['replies'] = $stmt->fetchAll();
        }

        $a['comments'] = $comments;
    }

    echo json_encode($announcements);
}

function createAnnouncementComment()
{
    global $pdo;

    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $announcement_id = $_POST['announcement_id'] ?? 0;
    $message = trim($_POST['message'] ?? '');
    $parent_id = $_POST['parent_comment_id'] ?? null;

    if ($message === '') {
        echo json_encode(['error' => 'Message cannot be empty']);
        return;
    }

    $stmt = $pdo->prepare("INSERT INTO announcement_comments (announcement_id, user_id, parent_comment_id, message) VALUES (?, ?, ?, ?)");
    try {
        $stmt->execute([$announcement_id, $_SESSION['user_id'], $parent_id, $message]);
        $id = $pdo->lastInsertId();

        logAudit('CREATE', 'announcement_comment', $id, null, ['announcement_id' => $announcement_id, 'message' => $message], 'Announcement comment created');

        $stmt = $pdo->prepare("SELECT c.*, u.full_name as author_name, u.role as author_role, u.profile_picture as author_profile_picture FROM announcement_comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?");
        $stmt->execute([$id]);
        $comment = $stmt->fetch();

        echo json_encode(['success' => true, 'comment' => $comment]);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to post comment']);
    }
}

function reactAnnouncementComment()
{
    global $pdo;

    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $comment_id = $_POST['comment_id'] ?? 0;
    $reaction = $_POST['reaction'] ?? '';

    if (!in_array($reaction, ['like', 'dislike'])) {
        echo json_encode(['error' => 'Invalid reaction']);
        return;
    }

    $stmt = $pdo->prepare("SELECT id, reaction FROM announcement_comment_reactions WHERE comment_id = ? AND user_id = ?");
    $stmt->execute([$comment_id, $_SESSION['user_id']]);
    $existing = $stmt->fetch();

    if ($existing) {
        if ($existing['reaction'] === $reaction) {
            $stmt = $pdo->prepare("DELETE FROM announcement_comment_reactions WHERE id = ?");
            $stmt->execute([$existing['id']]);
        } else {
            $stmt = $pdo->prepare("UPDATE announcement_comment_reactions SET reaction = ? WHERE id = ?");
            $stmt->execute([$reaction, $existing['id']]);
        }
    } else {
        $stmt = $pdo->prepare("INSERT INTO announcement_comment_reactions (comment_id, user_id, reaction) VALUES (?, ?, ?)");
        $stmt->execute([$comment_id, $_SESSION['user_id'], $reaction]);
    }

    $stmt = $pdo->prepare("SELECT (SELECT COUNT(*) FROM announcement_comment_reactions WHERE comment_id = ? AND reaction = 'like') as likes,
        (SELECT COUNT(*) FROM announcement_comment_reactions WHERE comment_id = ? AND reaction = 'dislike') as dislikes,
        (SELECT reaction FROM announcement_comment_reactions WHERE comment_id = ? AND user_id = ?) as user_reaction");
    $stmt->execute([$comment_id, $comment_id, $comment_id, $_SESSION['user_id']]);
    $counts = $stmt->fetch();

    echo json_encode(['success' => true, 'likes' => $counts['likes'], 'dislikes' => $counts['dislikes'], 'user_reaction' => $counts['user_reaction']]);
}

function deleteAnnouncementComment()
{
    global $pdo;

    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $comment_id = $_POST['comment_id'] ?? 0;

    $stmt = $pdo->prepare("SELECT user_id FROM announcement_comments WHERE id = ?");
    $stmt->execute([$comment_id]);
    $comment = $stmt->fetch();

    if (!$comment) {
        echo json_encode(['error' => 'Comment not found']);
        return;
    }

    if ($comment['user_id'] !== $_SESSION['user_id']) {
        echo json_encode(['error' => 'You can only delete your own comments']);
        return;
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM announcement_comment_reactions WHERE comment_id = ?");
        $stmt->execute([$comment_id]);
        $stmt = $pdo->prepare("DELETE FROM announcement_comments WHERE parent_comment_id = ?");
        $stmt->execute([$comment_id]);
        $stmt = $pdo->prepare("DELETE FROM announcement_comments WHERE id = ?");
        $stmt->execute([$comment_id]);

        logAudit('DELETE', 'announcement_comment', $comment_id, null, null, 'Announcement comment deleted by owner');

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to delete comment']);
    }
}

// ============================================================================
// USER MANAGEMENT FUNCTIONS
// ============================================================================

function getUsers()
{
    global $pdo;

    // Only admin can view user list
    if (!isLoggedIn() || $_SESSION['role'] !== 'admin') {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $stmt = $pdo->query("SELECT id, email, full_name, role, profile_picture, is_active, is_verified, created_at, deleted_at FROM users ORDER BY created_at DESC");
    $users = $stmt->fetchAll();

    echo json_encode(['success' => true, 'users' => $users]);
}

function deactivateUser()
{
    global $pdo;

    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $user_id = $_POST['user_id'] ?? 0;
    $current_user_id = $_SESSION['user_id'];

    // Check if user is deactivating themselves or if they're an admin deactivating another user
    if ($user_id == $current_user_id) {
        // Prevent admin from deactivating themselves
        if ($_SESSION['role'] === 'admin') {
            echo json_encode(['error' => 'You cannot deactivate your own admin account']);
            return;
        }
        // Regular user deactivating their own account - allowed
        $is_self_deactivation = true;
    } else if ($_SESSION['role'] === 'admin') {
        // Admin deactivating another user - allowed
        $is_self_deactivation = false;
    } else {
        // Regular user trying to deactivate another user - not allowed
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    // Check if user exists
    $stmt = $pdo->prepare("SELECT id, full_name FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode(['error' => 'User not found']);
        return;
    }

    try {
        $stmt = $pdo->prepare("UPDATE users SET is_active = 0, deleted_at = NOW() WHERE id = ?");
        $stmt->execute([$user_id]);

        if ($is_self_deactivation) {
            logAudit('UPDATE', 'user', $user_id, ['is_active' => 1], ['is_active' => 0], 'User deactivated their own account');
        } else {
            logAudit('UPDATE', 'user', $user_id, ['is_active' => 1], ['is_active' => 0], 'User deactivated by admin');
        }

        echo json_encode(['success' => true, 'message' => 'User ' . $user['full_name'] . ' has been deactivated']);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to deactivate user']);
    }
}

function reactivateUser()
{
    global $pdo;

    // Only admin can reactivate users
    if (!isLoggedIn() || $_SESSION['role'] !== 'admin') {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $user_id = $_POST['user_id'] ?? 0;

    // Check if user exists
    $stmt = $pdo->prepare("SELECT id, full_name FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode(['error' => 'User not found']);
        return;
    }

    try {
        $stmt = $pdo->prepare("UPDATE users SET is_active = 1, deleted_at = NULL WHERE id = ?");
        $stmt->execute([$user_id]);

        logAudit('UPDATE', 'user', $user_id, ['is_active' => 0], ['is_active' => 1], 'User reactivated by admin');

        echo json_encode(['success' => true, 'message' => 'User ' . $user['full_name'] . ' has been reactivated']);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Failed to reactivate user']);
    }
}

function reportUser()
{
    global $pdo;

    if (!isLoggedIn()) {
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }
}

?>
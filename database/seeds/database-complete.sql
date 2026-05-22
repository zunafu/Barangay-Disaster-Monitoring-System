-- ============================================================================
-- XAMPP - Barangay Disaster Monitoring System
-- Database: disaster_monitoring
-- Engine: InnoDB (MariaDB/MySQL)
-- Charset: utf8mb4 (Unicode support)
-- ============================================================================

-- Create Database
CREATE DATABASE IF NOT EXISTS disaster_monitoring;
USE disaster_monitoring;

-- ============================================================================
-- TABLE 1: users
-- ============================================================================
-- Purpose: Store user accounts with authentication and profile information
-- Relationships: 1-to-many with incidents, confirmations, comments, chat_messages
-- ============================================================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role ENUM('user', 'barangay', 'admin') DEFAULT 'user',
    profile_picture VARCHAR(255) DEFAULT NULL,
    is_verified INT DEFAULT 0,
    is_active INT DEFAULT 1,
    otp_code VARCHAR(6) NULL,
    otp_expiry DATETIME NULL,
    reset_token VARCHAR(100) NULL UNIQUE,
    reset_token_expiry DATETIME NULL,
    deleted_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_is_verified (is_verified),
    INDEX idx_is_active (is_active),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLE 2: incidents
-- ============================================================================
-- Purpose: Store disaster incident reports
-- Relationships: many-to-1 with users, 1-to-many with confirmations and comments
-- Business Rules:
--   - status: Default 'reported' when created by regular user
--   - severity: NULL until barangay/admin assigns it
--   - Only users can create incidents; barangay/admin can update status & severity
--   - Location data stored as latitude/longitude (Geoapify integration)
-- ============================================================================
CREATE TABLE incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    disaster_type ENUM('fire', 'flood', 'earthquake', 'typhoon', 'landslide', 'accident', 'other') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    address VARCHAR(500),
    image_path VARCHAR(500),
    weather_data JSON,
    status ENUM('reported', 'responding', 'in_area', 'resolved') DEFAULT 'reported',
    severity ENUM('low', 'medium', 'high', 'critical') NULL,
    eta_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Indexes for performance
    INDEX idx_user_id (user_id),
    INDEX idx_disaster_type (disaster_type),
    INDEX idx_eta_at (eta_at),
    INDEX idx_status (status),
    INDEX idx_severity (severity),
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLE 3: confirmations
-- ============================================================================
-- Purpose: Track user confirmations of incident reports (crowdsourced verification)
-- Relationships: many-to-1 with incidents and users
-- Business Rules:
--   - One confirmation per user per incident (UNIQUE constraint)
--   - Allows users to verify/confirm incidents reported by others
--   - Confirmation count shown on incident display
-- ============================================================================
CREATE TABLE confirmations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    incident_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate confirmations
    UNIQUE KEY unique_confirmation (incident_id, user_id),
    
    -- Indexes for performance
    INDEX idx_incident_id (incident_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLE 4: comments
-- ============================================================================
-- Purpose: Store threaded comments on incidents (discussion/updates)
-- Relationships: many-to-1 with incidents and users, self-referencing for replies
-- Business Rules:
--   - Supports nested comments (replies) via parent_comment_id
--   - Comments can have reactions (likes/dislikes)
--   - Comments deleted when incident is deleted (CASCADE)
--   - Author (user_id) deleted when comment deleted (CASCADE)
-- ============================================================================
CREATE TABLE comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    incident_id INT NOT NULL,
    user_id INT NOT NULL,
    parent_comment_id INT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    
    -- Indexes for performance
    INDEX idx_incident_id (incident_id),
    INDEX idx_user_id (user_id),
    INDEX idx_parent_comment_id (parent_comment_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLE 5: comment_reactions
-- ============================================================================
-- Purpose: Store user reactions to comments (like/dislike)
-- Relationships: many-to-1 with comments and users
-- Business Rules:
--   - One reaction per user per comment (UNIQUE constraint)
--   - User can toggle reaction on/off or switch between like/dislike
--   - Reactions deleted when comment/user deleted (CASCADE)
-- ============================================================================
CREATE TABLE comment_reactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comment_id INT NOT NULL,
    user_id INT NOT NULL,
    reaction ENUM('like', 'dislike') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate reactions
    UNIQUE KEY unique_reaction (comment_id, user_id),
    
    -- Indexes for performance
    INDEX idx_comment_id (comment_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLE 6: chat_messages
-- ============================================================================
-- Purpose: Store public community chat messages (real-time sync)
-- Relationships: many-to-1 with users, self-referencing for threaded messages
-- Business Rules:
--   - Public chat room for all users
--   - Supports threaded/nested messages via parent_message_id
--   - Chat messages can have reactions
--   - Messages deleted when user deleted (CASCADE)
-- ============================================================================
CREATE TABLE chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    parent_message_id INT DEFAULT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
    
    -- Indexes for performance
    INDEX idx_user_id (user_id),
    INDEX idx_parent_message_id (parent_message_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLE 7: chat_message_reactions
-- ============================================================================
-- Purpose: Store user reactions to chat messages (like/dislike)
-- Relationships: many-to-1 with chat_messages and users
-- Business Rules:
--   - One reaction per user per chat message (UNIQUE constraint)
--   - User can toggle reaction on/off or switch between like/dislike
--   - Reactions deleted when message/user deleted (CASCADE)
-- ============================================================================
CREATE TABLE chat_message_reactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id INT NOT NULL,
    reaction ENUM('like', 'dislike') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate reactions
    UNIQUE KEY unique_chat_reaction (message_id, user_id),
    
    -- Indexes for performance
    INDEX idx_message_id (message_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- BUSINESS RULES SUMMARY
-- ============================================================================
/*
1. USER AUTHENTICATION & VERIFICATION:
   - Email must be unique
   - Password is hashed using bcrypt (PASSWORD_DEFAULT)
   - OTP verification required before login (is_verified = 1)
   - OTP expires after 10 minutes (configurable in .env)
   - Password reset via OTP token (reset_token_expiry)
   - Soft delete: is_active = 0 marks user as inactive (not deleted)
   - deleted_at timestamp tracks when user was deactivated
   - Admins can deactivate/reactivate users without losing data

2. USER ROLES:
   - 'user': Regular citizen, can report incidents and comment
   - 'barangay': Barangay official, can update incident status and assign severity
   - 'admin': System administrator, full control

3. INCIDENT REPORTING:
   - Only logged-in users can create incidents
   - Default status: 'reported' (when created by user)
   - Severity: NULL until barangay/admin assigns it
   - Image uploads supported (stored in uploads/ directory)
   - Location tracked via GPS coordinates (latitude, longitude)
   - Disaster types: fire, flood, earthquake, typhoon, landslide, accident, other

4. INCIDENT LIFECYCLE:
   - reported → responding → in_area → resolved
   - Status updated only by barangay/admin
   - ETA can be set for response arrival

5. INCIDENT VERIFICATION (Confirmations):
   - Users can confirm/verify incidents reported by others
   - One confirmation per user per incident (prevents duplicates)
   - Confirmation count shown on incident view
   - Crowdsourced verification mechanism

6. COMMENTS & DISCUSSION:
   - Users can comment on incidents and reply to comments (threaded)
   - Comments are deleted when incident/user is deleted
   - Supports nested replies via parent_comment_id
   - Comments can be reacted to (like/dislike)

7. REACTIONS SYSTEM:
   - Users can like or dislike comments and chat messages
   - One reaction per user per item (prevents duplicate reactions)
   - Reactions can be toggled on/off or switched
   - Reaction counts aggregated per item

8. PUBLIC CHAT:
   - Community-wide chat for all logged-in users
   - Supports threaded/nested messages
   - Messages can be reacted to

9. DATA INTEGRITY:
   - All foreign keys use ON DELETE CASCADE for data consistency
   - Timestamps auto-updated on record modification
   - Unique constraints prevent duplicate entries
   - Indexes optimize query performance

10. PROFILE MANAGEMENT:
    - Users can upload profile pictures (JPEG, PNG, GIF, WebP)
    - Profile picture displayed in incidents, comments, and chat
    - Full name updatable via settings
    - Email not changeable (used as unique identifier)
*/

-- ============================================================================
-- DATABASE RELATIONSHIPS DIAGRAM
-- ============================================================================
/*
┌─────────────┐
│    users    │ (1)
└──────┬──────┘
       │
       ├─────────────────┬─────────────────┬─────────────────┬──────────────────┐
       │                 │                 │                 │                  │
       │(1:M)          │(1:M)           │(1:M)           │(1:M)            │(1:M)
       │                 │                 │                 │                  │
       ▼                 ▼                 ▼                 ▼                  ▼
  ┌──────────┐     ┌───────────┐    ┌──────────┐    ┌──────────────┐  ┌─────────────┐
  │incidents │     │confirmations│  │comments  │    │chat_messages │  │confirmations│
  └──────────┘     └───────────┘    └──────────┘    └──────────────┘  └─────────────┘
       │                 │                 │                │
       │                 │                 │ (Self-Ref)      │ (Self-Ref)
       │                 │                 │ (1:M)           │ (1:M)
       ▼                 ▼                 ▼                 ▼
  confirmations   confirmations    comment_reactions  chat_message_reactions
       (1:M)         (1:M)              (1:M)              (1:M)
        │              │                  │                  │
        │              │                  │                  │
        └──────────────┴──────────────────┴──────────────────┘
                         │
                         ▼
                       users (2nd join)
*/

-- ============================================================================
-- SAMPLE QUERIES FOR COMMON OPERATIONS
-- ============================================================================

-- Query 1: Get all incidents with reporter info and confirmation count
SELECT 
    i.id,
    i.title,
    i.disaster_type,
    i.status,
    i.severity,
    i.latitude,
    i.longitude,
    i.address,
    i.created_at,
    u.full_name as reporter_name,
    u.role as reporter_role,
    u.profile_picture,
    (SELECT COUNT(*) FROM confirmations WHERE incident_id = i.id) as confirmation_count,
    (SELECT COUNT(*) FROM comments WHERE incident_id = i.id) as comment_count
FROM incidents i
JOIN users u ON i.user_id = u.id
ORDER BY i.created_at DESC;

-- Query 2: Get incident details with all comments and reactions
-- NOTE: Replace 1 with actual incident_id you want to view
SELECT 
    i.id as incident_id,
    i.title,
    i.description,
    c.id as comment_id,
    c.comment,
    c.user_id,
    u.full_name as commenter_name,
    u.profile_picture,
    (SELECT COUNT(*) FROM comment_reactions WHERE comment_id = c.id AND reaction = 'like') as likes,
    (SELECT COUNT(*) FROM comment_reactions WHERE comment_id = c.id AND reaction = 'dislike') as dislikes,
    c.created_at as comment_date
FROM incidents i
LEFT JOIN comments c ON i.id = c.incident_id
LEFT JOIN users u ON c.user_id = u.id
WHERE i.id = 1
ORDER BY c.created_at DESC;

-- Query 3: Get public chat messages with thread replies
SELECT 
    cm.id,
    cm.message,
    cm.parent_message_id,
    u.full_name,
    u.profile_picture,
    (SELECT COUNT(*) FROM chat_message_reactions WHERE message_id = cm.id AND reaction = 'like') as likes,
    (SELECT COUNT(*) FROM chat_message_reactions WHERE message_id = cm.id AND reaction = 'dislike') as dislikes,
    cm.created_at
FROM chat_messages cm
JOIN users u ON cm.user_id = u.id
WHERE cm.parent_message_id IS NULL
ORDER BY cm.created_at DESC
LIMIT 50;

-- Query 4: Get unresolved incidents by disaster type
SELECT 
    disaster_type,
    COUNT(*) as incident_count,
    COALESCE(severity, 'unassigned') as severity,
    MIN(created_at) as oldest_incident
FROM incidents
WHERE status IN ('reported', 'responding', 'in_area')
GROUP BY disaster_type, severity
ORDER BY incident_count DESC;

-- Query 5: Get user statistics
SELECT 
    u.id,
    u.full_name,
    u.role,
    u.email,
    (SELECT COUNT(*) FROM incidents WHERE user_id = u.id) as incidents_reported,
    (SELECT COUNT(*) FROM confirmations WHERE user_id = u.id) as incidents_confirmed,
    (SELECT COUNT(*) FROM comments WHERE user_id = u.id) as comments_posted,
    (SELECT COUNT(*) FROM chat_messages WHERE user_id = u.id) as chat_messages
FROM users u
ORDER BY incidents_reported DESC;

-- Query 6: Get incidents needing barangay action (no severity assigned)
SELECT 
    i.id,
    i.title,
    i.disaster_type,
    i.address,
    u.full_name as reporter_name,
    i.created_at,
    (SELECT COUNT(*) FROM confirmations WHERE incident_id = i.id) as confirmations,
    TIMESTAMPDIFF(HOUR, i.created_at, NOW()) as hours_since_report
FROM incidents i
JOIN users u ON i.user_id = u.id
WHERE i.severity IS NULL 
  AND i.status IN ('reported', 'responding', 'in_area')
ORDER BY i.created_at ASC;

-- Query 7: Get verified users only
SELECT 
    id,
    email,
    full_name,
    role,
    profile_picture,
    created_at
FROM users
WHERE is_verified = 1
ORDER BY created_at DESC;

-- Query 8: Get unresolved incidents on map view
SELECT 
    id,
    title,
    disaster_type,
    latitude,
    longitude,
    address,
    status,
    severity,
    (SELECT COUNT(*) FROM confirmations WHERE incident_id = incidents.id) as confirmation_count
FROM incidents
WHERE status IN ('reported', 'responding', 'in_area')
ORDER BY created_at DESC;

-- ============================================================================
-- TABLE 8: announcements
-- ============================================================================
-- Purpose: Store barangay and admin announcements with community comments
-- Relationships: many-to-1 with users, 1-to-many with announcement_comments
-- Business Rules:
--   - Only barangay and admin can create announcements
--   - All users can read and comment on announcements
--   - Comments support likes/dislikes and nested replies
--   - Announcements are pinned at the top for visibility
-- ============================================================================
CREATE TABLE announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Indexes for performance
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLE 9: announcement_comments
-- ============================================================================
-- Purpose: Store comments on announcements with nested reply support
-- Relationships: many-to-1 with announcements and users, self-referencing for replies
-- Business Rules:
--   - All logged-in users can comment on announcements
--   - Supports nested replies via parent_comment_id
--   - Comments can have reactions (likes/dislikes)
--   - Comments deleted when announcement/user deleted (CASCADE)
-- ============================================================================
CREATE TABLE announcement_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    announcement_id INT NOT NULL,
    user_id INT NOT NULL,
    parent_comment_id INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES announcement_comments(id) ON DELETE CASCADE,
    
    -- Indexes for performance
    INDEX idx_announcement_id (announcement_id),
    INDEX idx_user_id (user_id),
    INDEX idx_parent_comment_id (parent_comment_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLE 10: announcement_comment_reactions
-- ============================================================================
-- Purpose: Store user reactions to announcement comments (like/dislike)
-- Relationships: many-to-1 with announcement_comments and users
-- Business Rules:
--   - One reaction per user per comment (UNIQUE constraint)
--   - User can toggle reaction on/off or switch between like/dislike
--   - Reactions deleted when comment/user deleted (CASCADE)
-- ============================================================================
CREATE TABLE announcement_comment_reactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comment_id INT NOT NULL,
    user_id INT NOT NULL,
    reaction ENUM('like', 'dislike') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (comment_id) REFERENCES announcement_comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate reactions
    UNIQUE KEY unique_announcement_reaction (comment_id, user_id),
    
    -- Indexes for performance
    INDEX idx_comment_id (comment_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLE 11: user_reports
-- ============================================================================
-- Purpose: Store user reports/complaints against other users
-- Relationships: many-to-1 with users (reporter and reported_user)
-- Business Rules:
--   - Users can report other users for inappropriate behavior
--   - Admin can view all reports and take action (deactivate if necessary)
--   - Multiple reports possible for same user
--   - Report reason tracked for moderation decisions
-- ============================================================================
CREATE TABLE user_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporter_user_id INT NOT NULL,
    reported_user_id INT NOT NULL,
    reason VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('pending', 'reviewed', 'resolved', 'dismissed') DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Indexes for performance
    INDEX idx_reporter_user_id (reporter_user_id),
    INDEX idx_reported_user_id (reported_user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLE 12: audit_logs
-- ============================================================================
-- Purpose: Store comprehensive audit trail of all system actions
-- Relationships: many-to-1 with users
-- Business Rules:
--   - Records all significant actions (CRUD operations)
--   - Tracks who did what, when, and why
--   - Stores before/after snapshots for critical data changes
--   - Essential for compliance and security auditing
-- ============================================================================
CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action_type ENUM('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'CONFIRM', 'REACT', 'ROLE_CHANGE') NOT NULL,
    entity_type ENUM('incident', 'user', 'comment', 'comment_reaction', 'chat_message', 'chat_message_reaction', 'announcement', 'announcement_comment', 'announcement_comment_reaction', 'confirmation', 'user_report') NOT NULL,
    entity_id INT,
    old_value JSON,
    new_value JSON,
    details TEXT,
    image_path VARCHAR(500),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Indexes for performance and querying
    INDEX idx_user_id (user_id),
    INDEX idx_action_type (action_type),
    INDEX idx_entity_type (entity_type),
    INDEX idx_entity_id (entity_id),
    INDEX idx_created_at (created_at),
    INDEX idx_composite (entity_type, entity_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TEST DATA INSERT
-- ============================================================================

-- Insert test user accounts (password: "password")
INSERT IGNORE INTO users (email, password, full_name, role, is_verified) VALUES
('user@test.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Test User', 'user', 1),
('barangay@test.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Barangay Official', 'barangay', 1),
('admin@test.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'System Admin', 'admin', 1);

-- ============================================================================
-- END OF DATABASE SCHEMA
-- ============================================================================

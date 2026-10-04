<?php
declare(strict_types=1);
/**
 * "Connect Discord" on the profile panel: attaches a Discord account to the
 * signed-in email user, the way steam_link.php attaches Steam.
 *
 * users.discord_id holds the Discord user id (a snowflake, up to 20 digits)
 * and users.discord_name the display name shown on the tile. Both columns are
 * added on first use where the site's DB user may ALTER; the same statements
 * are in profile_schema.sql for running by hand.
 */

function discordLinkColumnsExist(PDO $pdo): bool
{
    static $known = null;
    if ($known !== null) {
        return $known;
    }
    try {
        $known = dbColumnExists($pdo, 'users', 'discord_id')
            && dbColumnExists($pdo, 'users', 'discord_name');
    } catch (Throwable) {
        $known = false;
    }
    return $known;
}

function discordLinkColumnsEnsure(PDO $pdo): bool
{
    if (discordLinkColumnsExist($pdo)) {
        return true;
    }
    foreach ([
        ['discord_id', 'VARCHAR(32) NULL'],
        ['discord_name', 'VARCHAR(80) NULL'],
    ] as [$column, $definition]) {
        try {
            if (!dbColumnExists($pdo, 'users', $column)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN $column $definition");
            }
        } catch (Throwable $exception) {
            error_log('discord_link: could not add users.' . $column . ' - ' . $exception->getMessage());
            return false;
        }
    }
    try {
        return dbColumnExists($pdo, 'users', 'discord_id')
            && dbColumnExists($pdo, 'users', 'discord_name');
    } catch (Throwable) {
        return false;
    }
}

/**
 * Writes the Discord identity onto the user's row.
 *
 * Returns "linked", or "taken" when another account already holds that
 * Discord id - one Discord account per profile, like Steam.
 */
function discordLinkAttach(PDO $pdo, int $userId, array $identity): string
{
    $discordId = preg_replace('/\D+/', '', (string)($identity['provider_id'] ?? '')) ?? '';
    if ($discordId === '' || $userId <= 0) {
        throw new RuntimeException('Discord identity has no user id.');
    }

    $taken = $pdo->prepare('SELECT id FROM users WHERE discord_id = ? AND id <> ? LIMIT 1');
    $taken->execute([$discordId, $userId]);
    if ($taken->fetchColumn() !== false) {
        return 'taken';
    }

    $name = trim((string)($identity['display_name'] ?? $identity['persona_name'] ?? ''));
    $pdo->prepare('UPDATE users SET discord_id = ?, discord_name = ? WHERE id = ?')->execute([
        $discordId,
        mb_substr($name, 0, 80),
        $userId,
    ]);

    return 'linked';
}

function discordLinkDetach(PDO $pdo, int $userId): void
{
    $pdo->prepare('UPDATE users SET discord_id = NULL, discord_name = NULL WHERE id = ?')->execute([$userId]);
}

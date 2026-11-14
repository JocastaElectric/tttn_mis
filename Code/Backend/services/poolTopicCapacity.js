function getAvailablePoolTopicSlot(activeGroups, maxGroups, leaderCode) {
    const limit = Number(maxGroups);
    if (!Number.isInteger(limit) || limit < 1) return null;

    const normalizedLeader = String(leaderCode || '').trim().toUpperCase();
    const sameLeaderGroup = activeGroups.find(group =>
        String(group.leader_code || '').trim().toUpperCase() === normalizedLeader
    );
    if (activeGroups.length >= limit && !sameLeaderGroup) return null;

    const occupiedSlots = new Set(activeGroups
        .filter(group => !sameLeaderGroup || String(group._id) !== String(sameLeaderGroup._id))
        .map(group => Number(group.active_pool_topic_slot))
        .filter(slot => Number.isInteger(slot) && slot >= 1 && slot <= limit));
    for (let slot = 1; slot <= limit; slot++) {
        if (!occupiedSlots.has(slot)) return slot;
    }

    return null;
}

module.exports = { getAvailablePoolTopicSlot };

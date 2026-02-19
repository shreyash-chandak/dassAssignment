function sortEventsByPreference(events, user) {
  if (!user || user.role !== "participant") {
    return events;
  }

  const interests = new Set((user.interests || []).map((tag) => tag.toLowerCase()));
  const followed = new Set((user.followedOrganizers || []).map((id) => String(id)));

  return [...events].sort((a, b) => {
    const score = (event) => {
      const tagScore = (event.tags || []).reduce((acc, tag) => acc + (interests.has(String(tag).toLowerCase()) ? 2 : 0), 0);
      const followScore = followed.has(String(event.organizer?._id || event.organizer)) ? 3 : 0;
      return tagScore + followScore;
    };

    return score(b) - score(a);
  });
}

module.exports = { sortEventsByPreference };
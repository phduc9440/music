export interface PageMetaRoute {
  pattern: string;
  key: string;
  glyph: FaviconGlyph;
}

export type FaviconGlyph =
  | 'note'
  | 'edit'
  | 'play'
  | 'explore'
  | 'stats'
  | 'card'
  | 'chat'
  | 'team'
  | 'user'
  | 'admin'
  | 'alert';

/** Mỗi route tương ứng một tiêu đề (khóa meta.titles.* trong file locales meta.json) và một biểu tượng tab. */
export const PAGE_META_ROUTES: PageMetaRoute[] = [
  { pattern: '/auth/login', key: 'login', glyph: 'user' },
  { pattern: '/profile', key: 'profile', glyph: 'user' },
  { pattern: '/settings/notifications', key: 'notificationSettings', glyph: 'user' },
  { pattern: '/scores', key: 'scores', glyph: 'note' },
  { pattern: '/scores/upload', key: 'scoreUpload', glyph: 'note' },
  { pattern: '/scores/import', key: 'scoreImport', glyph: 'note' },
  { pattern: '/scores/official', key: 'officialScores', glyph: 'note' },
  { pattern: '/scores/official-requests', key: 'officialRequests', glyph: 'note' },
  { pattern: '/scores/shared', key: 'sharedScores', glyph: 'note' },
  { pattern: '/scores/trash', key: 'scoreTrash', glyph: 'note' },
  { pattern: '/scores/:id', key: 'scoreDetail', glyph: 'note' },
  { pattern: '/scores/:id/suggestions/:suggestionId', key: 'suggestion', glyph: 'edit' },
  { pattern: '/scores/:id/processing', key: 'scoreProcessing', glyph: 'note' },
  { pattern: '/scores/:id/review', key: 'scoreReview', glyph: 'edit' },
  { pattern: '/scores/:id/edit', key: 'scoreEdit', glyph: 'edit' },
  { pattern: '/scores/:id/play', key: 'scorePlay', glyph: 'play' },
  { pattern: '/s/:scoreId', key: 'publicScore', glyph: 'note' },
  { pattern: '/explore', key: 'explore', glyph: 'explore' },
  { pattern: '/composers', key: 'composers', glyph: 'explore' },
  { pattern: '/composers/:slug', key: 'composer', glyph: 'explore' },
  { pattern: '/playlists', key: 'playlists', glyph: 'note' },
  { pattern: '/playlists/:id', key: 'playlist', glyph: 'note' },
  { pattern: '/practice-history', key: 'practiceHistory', glyph: 'stats' },
  { pattern: '/practice-stats', key: 'practiceStats', glyph: 'stats' },
  { pattern: '/studio/history', key: 'studioHistory', glyph: 'stats' },
  { pattern: '/studio/sessions/:sessionId/report', key: 'studioReport', glyph: 'stats' },
  { pattern: '/pricing', key: 'pricing', glyph: 'card' },
  { pattern: '/billing', key: 'billing', glyph: 'card' },
  { pattern: '/billing/result', key: 'billingResult', glyph: 'card' },
  { pattern: '/forum', key: 'forum', glyph: 'chat' },
  { pattern: '/forum/new', key: 'forumNew', glyph: 'chat' },
  { pattern: '/forum/threads/:id', key: 'forumThread', glyph: 'chat' },
  { pattern: '/forum/threads/:id/edit', key: 'forumEdit', glyph: 'chat' },
  { pattern: '/my-tasks', key: 'myTasks', glyph: 'team' },
  { pattern: '/teams', key: 'teams', glyph: 'team' },
  { pattern: '/teams/invite/:token', key: 'teamInvite', glyph: 'team' },
  { pattern: '/teams/:id', key: 'team', glyph: 'team' },
  { pattern: '/teams/:teamId/shows/:showId', key: 'show', glyph: 'team' },
  { pattern: '/teams/:teamId/shows/:showId/perform', key: 'showPerform', glyph: 'play' },
  { pattern: '/dev/editor-spike/:id', key: 'devEditor', glyph: 'edit' },
  { pattern: '/admin', key: 'adminHome', glyph: 'admin' },
  { pattern: '/admin/profile', key: 'adminProfile', glyph: 'admin' },
  { pattern: '/admin/members', key: 'adminMembers', glyph: 'admin' },
  { pattern: '/admin/members/:id', key: 'adminMember', glyph: 'admin' },
  { pattern: '/admin/roles', key: 'adminRoles', glyph: 'admin' },
  { pattern: '/admin/teams', key: 'adminTeams', glyph: 'admin' },
  { pattern: '/admin/teams/:id', key: 'adminTeam', glyph: 'admin' },
  { pattern: '/admin/scores', key: 'adminScores', glyph: 'admin' },
  { pattern: '/admin/scores/:id', key: 'adminScore', glyph: 'admin' },
  { pattern: '/admin/scores/:id/edit', key: 'adminScoreEdit', glyph: 'admin' },
  { pattern: '/admin/scores/:id/play', key: 'adminScorePlay', glyph: 'admin' },
  { pattern: '/admin/scores/:id/processing', key: 'adminScoreProcessing', glyph: 'admin' },
  { pattern: '/admin/scores/:id/review', key: 'adminScoreReview', glyph: 'admin' },
  { pattern: '/admin/pending-scores', key: 'adminPending', glyph: 'admin' },
  { pattern: '/admin/reports', key: 'adminReports', glyph: 'admin' },
  { pattern: '/admin/forum', key: 'adminForum', glyph: 'admin' },
  { pattern: '/admin/activity', key: 'adminActivity', glyph: 'admin' },
  { pattern: '/admin/official-scores', key: 'adminOfficial', glyph: 'admin' },
  { pattern: '/admin/announcements', key: 'adminAnnouncements', glyph: 'admin' },
  { pattern: '/admin/tags', key: 'adminTags', glyph: 'admin' },
  { pattern: '/admin/revenue', key: 'adminRevenue', glyph: 'admin' },
  { pattern: '/admin/plans', key: 'adminPlans', glyph: 'admin' },
  { pattern: '/admin/member-plans', key: 'adminMemberPlans', glyph: 'admin' },
  { pattern: '/admin/composers', key: 'adminComposers', glyph: 'admin' },
  { pattern: '/admin/ai-tasks', key: 'adminAiTasks', glyph: 'admin' },
  { pattern: '/admin/system', key: 'adminSystem', glyph: 'admin' },
];

export type QuestionStatus = 'open' | 'answered' | 'closed';

export type SortOption = 'newest' | 'votes' | 'unanswered' | 'active' | 'accepted';

export type VoteTargetType = 'question' | 'answer';

export interface TagSummary {
  id: string;
  name: string;
  displayName: string;
  description: string;
  questionCount: number;
  createdAt: string;
}

export interface CommentItem {
  id: string;
  targetType: VoteTargetType;
  targetId: string;
  body: string;
  authorAccountId: string;
  authorName: string;
  createdAt: string;
}

export interface AnswerItem {
  id: string;
  questionId: string;
  body: string;
  authorAccountId: string;
  authorName: string;
  isAccepted: boolean;
  acceptedByAccountId: string | null;
  acceptedByName: string | null;
  voteScore: number;
  userVote: -1 | 0 | 1;
  comments: CommentItem[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionSummary {
  id: string;
  spaceKey: string;
  spaceId: string;
  title: string;
  body: string;
  authorAccountId: string;
  authorName: string;
  acceptedAnswerId: string | null;
  acceptedAnswerBody?: string | null;
  acceptedAnswerAuthor?: string | null;
  voteScore: number;
  answersCount: number;
  viewsCount: number;
  status: QuestionStatus;
  tags: string[];
  promotedPageId: string | null;
  promotedPageUrl: string | null;
  userVote: -1 | 0 | 1;
  isWatching: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionDetail extends QuestionSummary {
  answers: AnswerItem[];
  comments: CommentItem[];
}

export interface NotificationItem {
  id: string;
  recipientAccountId: string;
  questionId: string;
  eventType: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorAccountId: string;
  actorName: string;
  actionType: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  accountId: string;
  displayName: string;
  answersCount: number;
  acceptedCount: number;
  totalVotes: number;
  reputationScore: number;
}

export interface HubStats {
  totalQuestions: number;
  answeredQuestions: number;
  acceptedQuestions: number;
  unansweredQuestions: number;
  totalAnswers: number;
  resolutionRatePercent: number;
}

export interface ViewerProfile {
  accountId: string;
  displayName: string;
  isAdmin: boolean;
  spaceKey: string | null;
  spaceId: string | null;
  licenseActive: boolean;
  licenseEnvironment: string;
}

export interface ListQuestionsRequest {
  spaceKey?: string | null;
  search?: string;
  tag?: string;
  status?: QuestionStatus | 'all';
  sort?: SortOption;
  limit?: number;
  offset?: number;
  includeAcceptedAnswer?: boolean;
}

export interface ListQuestionsResponse {
  questions: QuestionSummary[];
  total: number;
  stats: HubStats;
}

export interface MacroConfig {
  heading?: string;
  mode?: 'all' | 'accepted' | 'unanswered' | 'tag';
  tagFilter?: string;
  spaceScope?: 'current' | 'global';
  showAcceptedAnswers?: boolean;
  maxItems?: number;
}

export interface RovoSearchRequest {
  query: string;
  spaceKey?: string;
  onlyVerified?: boolean;
}

export interface RovoSearchResultItem {
  questionId: string;
  spaceKey: string;
  questionTitle: string;
  questionBody: string;
  verifiedAnswer: string | null;
  acceptedBy: string | null;
  tags: string[];
  voteScore: number;
  promotedPageUrl: string | null;
}

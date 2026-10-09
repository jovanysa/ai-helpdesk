import { openDatabase } from './db';
import { GapLog } from './gap-recorder';
import { UnansweredRepository } from './unanswered-questions';

describe('GapLog', () => {
  let repo: UnansweredRepository;

  beforeEach(() => {
    repo = new UnansweredRepository(openDatabase(':memory:'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('records questions the knowledge could not answer', () => {
    new GapLog(repo).recordNoAnswer('فيه ركنة؟', 'معنديش المعلومة دي');
    expect(repo.listOpen('no_answer')).toMatchObject([{ question: 'فيه ركنة؟', lastReply: 'معنديش المعلومة دي', count: 1 }]);
  });

  it('records off-topic refusals under their own reason', () => {
    new GapLog(repo).recordOffTopic('مين كسب الماتش؟', 'refusal');
    expect(repo.listOpen('off_topic')).toHaveLength(1);
    expect(repo.listOpen('no_answer')).toHaveLength(0);
  });

  it('never throws when the database write fails', () => {
    vi.spyOn(repo, 'record').mockImplementation(() => {
      throw new Error('database is locked');
    });
    const log = new GapLog(repo);
    expect(() => log.recordNoAnswer('q', 'r')).not.toThrow();
    expect(() => log.recordOffTopic('q', 'r')).not.toThrow();
    expect(console.error).toHaveBeenCalledWith('[gaps] could not record question:', 'database is locked');
  });
});

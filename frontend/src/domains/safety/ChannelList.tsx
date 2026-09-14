/**
 * 도움받을 수 있는 곳. 위기 안내는 카드로, 위로 답변은 한 줄 띠로 같은 목록을 그린다.
 * 어느 창구가 눌렸는지는 여기서 한 번만 남긴다.
 */

import { useAnalytics } from '../../shared/analytics';
import type { Channel, CrisisLevel } from '../../shared/api';
import { TEST_IDS, testId } from '../../shared/testIds';

import { CHANNELS, resolveChannels } from './copy';
import './safety.css';

function PhoneIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="sf-ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.6 3.5h3l1.5 3.8-2 1.3a12 12 0 0 0 5.3 5.3l1.3-2 3.8 1.5v3a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" />
    </svg>
  );
}

function ChatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="sf-ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 12.5a7.5 7.5 0 0 1-10.8 6.7L4 20.5l1.4-4.9A7.5 7.5 0 1 1 20 12.5Z" />
    </svg>
  );
}

/** SNS 창구는 앱 밖으로 나가므로 새 창으로 연다 */
function linkProps(kind: 'call' | 'sns') {
  return kind === 'sns' ? { target: '_blank' as const, rel: 'noreferrer' } : {};
}

function exitOf(kind: 'call' | 'sns'): 'channel_call' | 'channel_sns' {
  return kind === 'call' ? 'channel_call' : 'channel_sns';
}

export interface ChannelListProps {
  channels: Channel[];
  level: CrisisLevel;
}

/** 위기 안내의 창구 카드. 첫 줄이 가장 먼저 걸어야 할 곳이다 */
export function ChannelList({ channels, level }: ChannelListProps) {
  const analytics = useAnalytics();
  const list = resolveChannels(channels);

  return (
    <div className="sf-lines">
      {list.map((key, index) => {
        const channel = CHANNELS[key];
        const lead = index === 0 ? ' sf-line-item--lead' : '';
        return (
          <a
            key={key}
            className={`sf-line-item${lead}`}
            href={channel.href}
            {...linkProps(channel.kind)}
            onClick={() => {
              analytics.log('crisis_exit', { level, exit: exitOf(channel.kind) }, { kind: 'click' });
            }}
            {...testId(TEST_IDS.crisisChannel)}
          >
            <span className="sf-line-ic">{channel.kind === 'call' ? <PhoneIcon /> : <ChatIcon />}</span>
            <span className="sf-line-txt">
              <span className="sf-line-name">{channel.name}</span>
              <span className="sf-line-num">{channel.value}</span>
              {channel.note != null && <span className="sf-line-sub">{channel.note}</span>}
            </span>
          </a>
        );
      })}
    </div>
  );
}

export interface ChannelBandsProps {
  channels: Channel[];
  level: CrisisLevel;
  place: 'top' | 'bottom';
}

/** 위로 답변의 한 줄 띠. 답변 위와 아래에 같은 목록이 붙는다 */
export function ChannelBands({ channels, level, place }: ChannelBandsProps) {
  const analytics = useAnalytics();

  return (
    <>
      {channels.map((key) => {
        const channel = CHANNELS[key];
        const link = (
          <a
            href={channel.href}
            {...linkProps(channel.kind)}
            onClick={() => {
              analytics.log('crisis_exit', { level, exit: exitOf(channel.kind) }, { kind: 'click' });
            }}
            {...testId(TEST_IDS.crisisChannel)}
          >
            {channel.short}
          </a>
        );
        return (
          <p key={key} className={`sf-sc-band sf-sc-band--${place}`}>
            {channel.kind === 'call' ? <PhoneIcon size={15} /> : <ChatIcon size={15} />}
            {channel.kind === 'call' ? (
              <span>언제든 {link} 로 연결할 수 있어요</span>
            ) : (
              <span>글로 하고 싶다면 {link} 이 있어요</span>
            )}
          </p>
        );
      })}
    </>
  );
}

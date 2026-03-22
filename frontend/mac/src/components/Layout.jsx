import { motion } from 'framer-motion';
import IntakePanel from './panels/IntakePanel';
import AgentTheater from './panels/AgentTheater';
import DecisionPanel from './panels/DecisionPanel';

export default function Layout({
  presentationMode,
  job,
  items,
  bids,
  decisions,
  listings,
  threads,
  agents,
  agentsRaw,
  events,
  lastEvent,
  onUpload,
  onExecuteItem,
  onSendReply,
}) {
  return (
    <motion.div
      className={`layout ${presentationMode ? 'presentation' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="panel-left">
        <IntakePanel
          job={job}
          items={items}
          onUpload={onUpload}
        />
      </div>

      <div className="panel-center">
        <AgentTheater
          job={job}
          items={items}
          bids={bids}
          decisions={decisions}
          listings={listings}
          threads={threads}
          agents={agents}
          agentsRaw={agentsRaw}
          events={events}
          lastEvent={lastEvent}
          onExecuteItem={onExecuteItem}
          onSendReply={onSendReply}
        />
      </div>

      <div className="panel-right">
        <DecisionPanel
          items={items}
          decisions={decisions}
          agents={agents}
          onExecuteItem={onExecuteItem}
        />
      </div>
    </motion.div>
  );
}

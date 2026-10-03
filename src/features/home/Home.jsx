import {PollHome} from '../polls/PollHome.jsx';
import Dinner from '../dinner/Dinner.jsx';
import FamilyNotices from '../chat/PinnedChatCard.jsx';
import GroceryHomeCard from '../groceries/GroceryHomeCard.jsx';
import CalendarHomeCard from '../calendar/CalendarHomeCard.jsx';
import {ErrorMessage,NoHousehold} from '../../shared/ui/Shared.jsx';
import {useDirectory} from '../directory/useDirectory.js';
import Celebrations from '../directory/Celebrations.jsx';
export default function Home({member,polls}) {
 const directory=useDirectory();
 return <section className="home-view" aria-label="Home">
  <div className="home-grid">
   {member.household ? <><Dinner member={member} compact/><PollHome summary={polls}/><GroceryHomeCard member={member}/></> : <NoHousehold/>}
   <CalendarHomeCard/>
   <FamilyNotices currentPersonId={member.person?.id} people={directory.data?.people || []}/>
  </div>
  <ErrorMessage error={directory.error}/>
  <Celebrations directory={directory} compact/>
 </section>;
}

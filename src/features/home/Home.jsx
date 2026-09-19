import Dinner from '../dinner/Dinner.jsx';
import FamilyNotices from '../chat/PinnedChatCard.jsx';
import GroceryHomeCard from '../groceries/GroceryHomeCard.jsx';
import CalendarHomeCard from '../calendar/CalendarHomeCard.jsx';
import {ErrorMessage} from '../../shared/ui/Shared.jsx';
import {useDirectory} from '../directory/useDirectory.js';
import Celebrations from '../directory/Celebrations.jsx';
export default function Home({member}) {
 const directory=useDirectory();
 return <section className="home-view" aria-label="Home">
  <div className="home-grid">
   <GroceryHomeCard member={member}/>
   <Dinner member={member} compact/>
   <CalendarHomeCard/>
   <FamilyNotices currentPersonId={member.person?.id} people={directory.data?.people || []}/>
  </div>
  <ErrorMessage error={directory.error}/>
  <Celebrations directory={directory} compact/>
 </section>;
}

import {
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  ShoppingBag,
  Receipt,
  Plane,
  Wallet,
  CreditCard,
  Settings,
  PackageSearch
} from "lucide-react";

import {
  NavLink
} from "react-router-dom";


function Sidebar(){


const menu = [

{
title:"MAIN",
items:[

{
name:"Dashboard",
path:"/dashboard",
icon:LayoutDashboard
},

{
name:"Customers",
path:"/customers",
icon:Users
},

{
name:"Services",
path:"/services",
icon:BriefcaseBusiness
},

{
name:"Orders",
path:"/orders",
icon:ShoppingBag
},

{
name:"Receipts",
path:"/receipts",
icon:Receipt
}

]

},


{
title:"IMPORT",

items:[

{
name:"China Orders",
path:"/china-orders",
icon:PackageSearch
},


{
name:"Vietnam Orders",
path:"/vietnam-orders",
icon:Plane
}

]

},


{
title:"FINANCE",

items:[

{
name:"Payments",
path:"/payments",
icon:Wallet
},


{
name:"Wallet",
path:"/wallet",
icon:Wallet
},

{
name:"Savings",
path:"/savings",
icon:Wallet
}

]

},


{
title:"CREDIT",

items:[

{
name:"Loans",
path:"/loans",
icon:CreditCard
}

]

},


{
title:"SYSTEM",

items:[

{
name:"Settings",
path:"/settings",
icon:Settings
}

]

}


];



return (

<aside className="sidebar">


<div className="sidebar-logo">

YN Studio

</div>



<nav>


{

menu.map(section=>(

<div 
key={section.title}
className="sidebar-section"
>


<p className="sidebar-title">

{section.title}

</p>



{

section.items.map(item=>{


const Icon=item.icon;


return (

<NavLink

key={item.path}

to={item.path}

className={({isActive})=>

isActive
?
"sidebar-link active"
:
"sidebar-link"

}

>


<Icon size={19}/>


<span>

{item.name}

</span>


</NavLink>

)


})

}



</div>


))

}


</nav>


</aside>

);


}


export default Sidebar;
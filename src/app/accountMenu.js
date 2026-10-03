export function shouldDismissAccountMenu(menu,target){
 return Boolean(menu?.open&&!menu.contains(target));
}

Dev Notes after Milestone 2

After reviewing the code, I must say I am a bit disappointed. Skimming past the architectural document, I can see there are a lot
of inconsistencies in the folder structure specifically in the client folder and I have'nt even looked into the core logic right now (im really worried). The modular structure is not being followed. Same for the server folder structure

Client routes
- the routes should have been maintained in the the routes.js file. The App.jsx uses the loop to get the routes but the remaining routes are fixed there, why is that?? The full routing structure should be maintained in this file, if we want to break them up we can (i.e. nested routing) but it should be managed in the routes.jsx not the app.jsx

Client folder structure
- The folder strucuture is completely messed up. Really hard to navigate.
- What are layouts vs views??? vs componenets??? We need to keep it simple
- shared components (that are used by multiple modules should be at a single place) inside the components folder. The test files are on the same level as the jsx and js files, each should be grouped in a folder i.e cancelModel/cancelModel.jsx and cancelModel/cancelModel.test.js (you get the idea) , same goes inside views and other folders.
- Rather than coupling the logic plus view inside an each file we should segregate the service of module in a different file. The service file should be manageing state and everything. The view layer should only be responsible of managing the view. goal-> for example the same service or module can have differnet ways of displaying the same data. 
- Same goes for the lib folder, every file is destructured, they should atleast be grouped inside their own folder
- I also need to talk on what is the purpose of each file inside the lib folder and why was it created, what purpose or problem it solves? is it coherent with the documentation. ALL THESE QUESTIONS need to be answered.


Final notes
- I expect you to answer all the questions and provide clear answers
- The purpose of this review is mainly to correct the client side's folder structure. We are NOT adding/updating/deleting code, we are only moving the pieces of code and structuring them properly
- If a specific part of code falls into a file it should not then we need to fix that as well. i.e a shared component in the views folder should be moved to the shared folder. So you need to STAY ALERT for these as well.
- You NEED to lookout if any of these changes require updates in the spec documentations. Present those changes and DO NOT implement them until you get them APPROVED.








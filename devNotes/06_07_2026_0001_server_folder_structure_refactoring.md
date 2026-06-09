The module, service, controller folder structuring is not as i expected.
It should be grouped better
The scope of this review and improvement is only file restructuring NO CODE CHANGE only moving code.

### Module, Controller, Services, Routes Restructuring
- Each module should have
    - index.js
        - this file contains all the routes that module must use
        - it should be calling the controller and all the middlewares for that routes and it is the one being exported in the main server routes.js file

    - controller.js
        - all the controller functions should be in this file.
        - Each function is responsible for resolving the service file functions
        - no db calls in this file
        - it must only resolve the req and res and errors etc

    - service.js
        - all db calls must be made inside the service functions.

    - test.js
        - if it exists it should be testing all the services and making user it returns the correct responses
        - it should test the core business logic in the service.js file

- Each module will be in the module folder i.e. module/doctor etc.
- So now we wont be needing a seperate services, routes and controller folder.
- You would need to create a routes file in the server which would be managing index route of each module. 


### lib, middleware, http, config
- For the lib and middleware folders, the files should be grouped to have their js file and test files in a single folder



### General Notes
- You should be on a lookout for spec docs updates in the docs/spec folder on root, and they must be APPROVED by the human user.


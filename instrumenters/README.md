# Instrumenters

The debugger relies on instrumented code to collect and send information about the code runtime execution. 
For that purpose instrumenters are created for every supported language.

Check each instrumenter for the needed setup (ex: install dependencies)

### Instrumentation
Each instrumenter offers two commands
1) `prepare-dest` - prepares the shadow project structure with the needed dependencies (the runtime recorder)

2) `instrument` - transforms a single user code file to an instrumented one and saves it 


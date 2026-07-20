#pragma once

class Debugger
{

public:
    static Debugger &instance()
    {
        static Debugger instance;
        return instance;
    }
};

#define D Debugger.instance()
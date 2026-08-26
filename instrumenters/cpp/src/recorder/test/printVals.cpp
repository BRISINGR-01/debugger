// example.cpp  —  exercised by the instrumenter plugin
// ============================================================================
//  Compile (after building the plugin):
//
//    clang++ -fplugin=./build/Instrumenter.so \
//            -include recorder_runtime.h \
//            -std=c++20 -c example.cpp -o example.o
//
//  Or run the full demo:
//
//    clang++ -fplugin=./build/Instrumenter.so \
//            -include recorder_runtime.h \
//            -std=c++20 example.cpp -o example_demo
//    ./example_demo
// ============================================================================
#include <stdexcept>
#include <string>
#include <vector>
#include <iostream>
#include "header.h"
#include "../dbg-header.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <bitset>
#include <chrono>
#include <complex>
#include <deque>
#include <forward_list>
#include <functional>
#include <future>
#include <list>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <queue>
#include <random>
#include <ranges> // C++20
#include <regex>
#include <set>
#include <span> // C++20
#include <stack>
#include <string>
#include <string_view>
#include <thread>
#include <tuple>
#include <typeindex>
#include <typeinfo>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <variant>
#include <vector>

#include <cstdint>
#include <cstddef>
#include <initializer_list>

// ------------------------------------------------------------
// 1. std::string family
// ------------------------------------------------------------

void debug_strings()
{
    std::string str{"hello world"};
    std::string empty{};
    std::string repeated(10, 'x');

    std::string_view view{"hello"};
    std::string_view empty_view{};

    std::wstring wide{L"wide string"};
    std::u8string utf8{u8"UTF-8"};
    std::u16string utf16{u"UTF-16"};
    std::u32string utf32{U"UTF-32"};

    printf("std::string str{\"hello world\"}\n");
    debug(), str;
    printf("std::string empty{}\n");
    debug(), empty;
    printf("std::string repeated(10, 'x')\n");
    debug(), repeated;
    printf("std::string_view view{\"hello\"}\n");
    debug(), view;
    printf("std::string_view empty_view{}\n");
    debug(), empty_view;
    printf("std::wstring wide{L\"wide string\"}\n");
    debug(), wide;
    printf("std::u8string utf8{...}\n");
    debug(), utf8;
    printf("std::u16string utf16{...}\n");
    debug(), utf16;
    printf("std::u32string utf32{...}\n");
    debug(), utf32;
}

// ------------------------------------------------------------
// 2. Sequence containers
// ------------------------------------------------------------

void debug_sequence_containers()
{
    std::vector vec{1, 2, 3};
    std::vector<int> empty_vec{};

    std::array<int, 4> arr{1, 2, 3, 4};

    std::deque<int> deque{1, 2, 3};

    std::list<int> list{1, 2, 3};

    std::forward_list<int> forward_list{1, 2, 3};

    printf("std::vector vec{1, 2, 3}\n");
    debug(), vec;
    printf("std::vector<int> empty_vec{}\n");
    debug(), empty_vec;
    printf("std::array<int, 4> arr{1, 2, 3, 4}\n");
    debug(), arr;
    printf("std::deque<int> deque{1, 2, 3}\n");
    debug(), deque;
    printf("std::list<int> list{1, 2, 3}\n");
    debug(), list;
    printf("std::forward_list<int> forward_list{1, 2, 3}\n");
    debug(), forward_list;
}

// ------------------------------------------------------------
// 3. Associative containers
// ------------------------------------------------------------

void debug_associative_containers()
{
    std::set<int> set{1, 2, 3};

    std::multiset<int> multiset{1, 1, 2, 3};

    std::map<std::string, int> map{
        {"one", 1},
        {"two", 2},
        {"three", 3}};

    std::multimap<std::string, int> multimap{
        {"x", 1},
        {"x", 2},
        {"y", 3}};

    std::unordered_set<int> unordered_set{1, 2, 3};

    std::unordered_multiset<int> unordered_multiset{
        1, 1, 2, 3};

    std::unordered_map<std::string, int> unordered_map{
        {"one", 1},
        {"two", 2}};

    std::unordered_multimap<std::string, int> unordered_multimap{
        {"x", 1},
        {"x", 2}};

    printf("std::set<int> set{1, 2, 3}\n");
    debug(), set;
    printf("std::multiset<int> multiset{1, 1, 2, 3}\n");
    debug(), multiset;
    printf("std::map<std::string, int> map{...}\n");
    debug(), map;
    printf("std::multimap<std::string, int> multimap{...}\n");
    debug(), multimap;
    printf("std::unordered_set<int> unordered_set{...}\n");
    debug(), unordered_set;
    printf("std::unordered_multiset<int> unordered_multiset{...}\n");
    debug(), unordered_multiset;
    printf("std::unordered_map<std::string, int> unordered_map{...}\n");
    debug(), unordered_map;
    printf("std::unordered_multimap<std::string, int> unordered_multimap{...}\n");
    debug(), unordered_multimap;
}

// ------------------------------------------------------------
// 4. Container adaptors
// ------------------------------------------------------------

void debug_container_adaptors()
{
    std::stack<int> stack;
    stack.push(1);
    stack.push(2);
    stack.push(3);

    std::queue<int> queue;
    queue.push(1);
    queue.push(2);
    queue.push(3);

    std::priority_queue<int> priority_queue;
    priority_queue.push(10);
    priority_queue.push(30);
    priority_queue.push(20);

    printf("std::stack<int> stack\n");
    printf("std::queue<int> queue\n");
    printf("std::priority_queue<int> priority_queue\n");
}

// ------------------------------------------------------------
// 5. std::pair / tuple / structured data
// ------------------------------------------------------------

void debug_tuple_types()
{
    std::pair<int, std::string> pair{42, "answer"};

    std::tuple<int, std::string, double> tuple{
        42,
        "hello",
        3.14};

    auto [pair_number, pair_text] = pair;

    auto [tuple_number, tuple_text, tuple_value] = tuple;

    std::tuple<> empty_tuple{};

    printf("std::pair<int, std::string> pair{...}\n");
    printf("std::tuple<int, std::string, double> tuple{...}\n");
    printf("auto [pair_number, pair_text] = pair\n");
    printf("auto [tuple_number, tuple_text, tuple_value] = tuple\n");
    printf("std::tuple<> empty_tuple{}\n");
}

// ------------------------------------------------------------
// 6. optional / variant / any
// ------------------------------------------------------------

#include <any>

void debug_dynamic_types()
{
    std::optional<int> optional_value{42};
    std::optional<std::string> optional_string{
        "present"};

    std::optional<int> empty_optional{};

    std::variant<int, double, std::string> variant{"hello"};

    std::variant<int, double, std::string> variant_int{42};

    std::any any_int{42};
    std::any any_string{std::string{"hello"}};

    std::any empty_any{};

    printf("std::optional<int> optional_value{42}\n");
    printf("std::optional<std::string> optional_string{...}\n");
    printf("std::optional<int> empty_optional{}\n");
    printf("std::variant<int, double, std::string> variant{...}\n");
    printf("std::variant<int, double, std::string> variant_int{...}\n");
    printf("std::any any_int{42}\n");
    printf("std::any any_string{...}\n");
    printf("std::any empty_any{}\n");
}

// ------------------------------------------------------------
// 7. Smart pointers
// ------------------------------------------------------------

struct Point
{
    int x;
    int y;
};

void debug_smart_pointers()
{
    auto unique = std::make_unique<Point>(10, 20);

    auto shared = std::make_shared<Point>(30, 40);

    std::weak_ptr<Point> weak = shared;

    std::unique_ptr<Point> null_unique{};

    std::shared_ptr<Point> null_shared{};

    printf("std::unique_ptr<Point> unique\n");
    printf("std::shared_ptr<Point> shared\n");
    printf("std::weak_ptr<Point> weak\n");
    printf("std::unique_ptr<Point> null_unique{}\n");
    printf("std::shared_ptr<Point> null_shared{}\n");
}

// ------------------------------------------------------------
// 8. References, pointers, const/reference combinations
// ------------------------------------------------------------

void debug_reference_types()
{
    std::string value{"hello"};

    std::string &reference = value;

    const std::string const_value{"constant"};

    const std::string &const_reference = const_value;

    std::string *pointer = &value;

    const std::string *pointer_to_const = &value;

    std::string *const const_pointer = &value;

    const std::string *const const_pointer_to_const = &value;

    printf("std::string& reference = value\n");
    printf("const std::string const_value{...}\n");
    printf("const std::string& const_reference = const_value\n");
    printf("std::string* pointer = &value\n");
    printf("const std::string* pointer_to_const = &value\n");
    printf("std::string* const const_pointer = &value\n");
    printf("const std::string* const const_pointer_to_const = &value\n");
}

// ------------------------------------------------------------
// 9. Function pointers / std::function / bind
// ------------------------------------------------------------

int add2(int a, int b)
{
    return a + b;
}

void debug_function_types()
{
    int (*function_pointer)(int, int) = &add2;

    std::function<int(int, int)> function = add2;

    auto lambda = [](int x)
    {
        return x * 2;
    };

    std::function<int(int)> lambda_function = lambda;

    auto bound = std::bind(add2, 10, std::placeholders::_1);

    printf("int (*function_pointer)(int, int) = &add2\n");
    printf("std::function<int(int, int)> function = add2\n");
    printf("auto lambda = [](int x) { return x * 2; }\n");
    printf("std::function<int(int)> lambda_function = lambda\n");
    printf("auto bound = std::bind(...)\n");
}

// ------------------------------------------------------------
// 10. Initializer lists
// ------------------------------------------------------------

void debug_initializer_lists()
{
    std::initializer_list<int> values{1, 2, 3, 4, 5};

    std::initializer_list<std::string> strings{
        "one",
        "two",
        "three"};

    printf("std::initializer_list<int> values{...}\n");
    printf("std::initializer_list<std::string> strings{...}\n");
}

// ------------------------------------------------------------
// 11. std::span / views
// ------------------------------------------------------------

void debug_span()
{
    std::vector<int> vector{1, 2, 3, 4};

    std::span<int> span{vector};

    std::span<const int> const_span{vector};

    std::span<int> subspan = span.subspan(1, 2);

    printf("std::span<int> span{vector}\n");
    printf("std::span<const int> const_span{vector}\n");
    printf("std::span<int> subspan = span.subspan(1, 2)\n");
}

// ------------------------------------------------------------
// 12. chrono
// ------------------------------------------------------------

void debug_chrono()
{
    using namespace std::chrono;

    nanoseconds ns{123456};

    microseconds us{123};

    milliseconds ms{500};

    seconds sec{42};

    minutes min{5};

    hours hour{2};

    days day{7};

    auto duration = 2h + 30min + 15s;

    steady_clock::time_point steady_now =
        steady_clock::now();

    system_clock::time_point system_now =
        system_clock::now();

    high_resolution_clock::time_point high_now =
        high_resolution_clock::now();

    auto time_since_epoch =
        system_now.time_since_epoch();

    year_month_day date{
        year{2026},
        month{8},
        std::chrono::day{26}};

    weekday weekday_value{date};

    printf("std::chrono::nanoseconds ns{123456}\n");
    printf("std::chrono::microseconds us{123}\n");
    printf("std::chrono::milliseconds ms{500}\n");
    printf("std::chrono::seconds sec{42}\n");
    printf("std::chrono::minutes min{5}\n");
    printf("std::chrono::hours hour{2}\n");
    printf("auto duration = 2h + 30min + 15s\n");
    printf("steady_clock::time_point steady_now\n");
    printf("system_clock::time_point system_now\n");
    printf("high_resolution_clock::time_point high_now\n");
    printf("std::chrono::year_month_day date\n");
    printf("std::chrono::weekday weekday_value\n");
}

// ------------------------------------------------------------
// 13. complex / bitset
// ------------------------------------------------------------

void debug_numeric_library_types()
{
    std::complex<double> complex_value{3.0, 4.0};

    std::complex<float> complex_float{1.0f, 2.0f};

    std::bitset<8> bits{0b10101010};

    std::bitset<64> large_bits{
        0x123456789abcdef0ULL};

    printf("std::complex<double> complex_value{3.0, 4.0}\n");
    printf("std::complex<float> complex_float{1.0f, 2.0f}\n");
    printf("std::bitset<8> bits{0b10101010}\n");
    printf("std::bitset<64> large_bits{...}\n");
}

// ------------------------------------------------------------
// 14. Random-number machinery
// ------------------------------------------------------------

void debug_random()
{
    std::random_device random_device;

    std::mt19937 generator{random_device()};

    std::mt19937_64 generator64{random_device()};

    std::uniform_int_distribution<int> int_distribution{
        1, 100};

    std::uniform_real_distribution<double> real_distribution{
        0.0, 1.0};

    std::normal_distribution<double> normal_distribution{
        0.0, 1.0};

    std::bernoulli_distribution bernoulli{
        0.5};

    int random_int = int_distribution(generator);

    double random_real =
        real_distribution(generator);

    double normal =
        normal_distribution(generator);

    bool random_bool =
        bernoulli(generator);

    printf("std::random_device random_device\n");
    printf("std::mt19937 generator{...}\n");
    printf("std::mt19937_64 generator64{...}\n");
    printf("std::uniform_int_distribution<int> int_distribution\n");
    printf("std::uniform_real_distribution<double> real_distribution\n");
    printf("std::normal_distribution<double> normal_distribution\n");
    printf("std::bernoulli_distribution bernoulli\n");
    printf("int random_int = int_distribution(generator)\n");
    printf("double random_real = real_distribution(generator)\n");
    printf("double normal = normal_distribution(generator)\n");
    printf("bool random_bool = bernoulli(generator)\n");
}

// ------------------------------------------------------------
// 15. enum / enum class
// ------------------------------------------------------------

enum Color
{
    Red,
    Green,
    Blue
};

enum class Status
{
    Unknown,
    Ready,
    Running,
    Finished
};

enum class ErrorCode : std::uint32_t
{
    None = 0,
    Network = 1,
    Timeout = 2
};

void debug_enums()
{
    Color color = Green;

    Status status = Status::Running;

    ErrorCode error = ErrorCode::Timeout;

    printf("Color color = Green\n");
    printf("Status status = Status::Running\n");
    printf("ErrorCode error = ErrorCode::Timeout\n");
}

// ------------------------------------------------------------
// 16. C-style arrays
// ------------------------------------------------------------

void debug_arrays()
{
    int array[5]{1, 2, 3, 4, 5};

    char characters[6]{"hello"};

    Point points[3]{
        {1, 2},
        {3, 4},
        {5, 6}};

    int matrix[3][3]{
        {1, 2, 3},
        {4, 5, 6},
        {7, 8, 9}};

    printf("int array[5]{1, 2, 3, 4, 5}\n");
    printf("char characters[6]{\"hello\"}\n");
    printf("Point points[3]{...}\n");
    printf("int matrix[3][3]{...}\n");
}

// ------------------------------------------------------------
// 17. Union
// ------------------------------------------------------------

union BasicUnion
{
    int integer;
    float floating;
    double decimal;
};

union TaggedPayload
{
    std::int64_t integer;
    double decimal;
    char text[16];
};

void debug_unions()
{
    BasicUnion basic{};

    basic.integer = 42;

    TaggedPayload payload{};

    payload.decimal = 3.14159;

    printf("BasicUnion basic{}\n");
    printf("TaggedPayload payload{}\n");
}

// ------------------------------------------------------------
// 18. Anonymous union inside struct
// ------------------------------------------------------------

struct Message
{
    enum class Type
    {
        Integer,
        Floating
    };

    Type type;

    union
    {
        int integer;
        double floating;
    };
};

void debug_anonymous_union()
{
    Message message{
        Message::Type::Integer};

    message.integer = 42;

    printf("Message message{Message::Type::Integer}\n");
    printf("message.integer = 42\n");
}

// ------------------------------------------------------------
// 19. Plain custom structs
// ------------------------------------------------------------

struct Person
{
    std::string name;
    int age;
    double score;
};

struct Nested
{
    int id;

    Person person;

    std::vector<int> values;

    std::optional<std::string> nickname;
};

struct ComplexStruct
{
    std::string name;

    std::vector<std::string> tags;

    std::map<std::string, int> attributes;

    std::unique_ptr<Person> owner;

    std::variant<int, std::string> payload;
};

void debug_structs()
{
    Person person{
        "Alice",
        30,
        97.5};

    Nested nested{
        1,
        {"Bob", 40, 88.5},
        {1, 2, 3},
        "Bobby"};

    ComplexStruct complex{
        "object",
        {"one", "two"},
        {{"x", 10}, {"y", 20}},
        std::make_unique<Person>(
            Person{"Owner", 50, 99.0}),
        std::string{"payload"}};

    printf("Person person{...}\n");
    printf("Nested nested{...}\n");
    printf("ComplexStruct complex{...}\n");
}

// ------------------------------------------------------------
// 20. Classes with private/public/protected state
// ------------------------------------------------------------

class MixedClass
{
public:
    int public_value{10};

    std::string public_name{"public"};

    void public_function()
    {
        private_value++;
    }

protected:
    double protected_value{20.5};

    std::vector<int> protected_values{1, 2, 3};

private:
    int private_value{42};

    std::string private_name{"private"};

    std::unique_ptr<Person> private_owner{
        std::make_unique<Person>(
            Person{"Private", 99, 100.0})};
};

void debug_mixed_class()
{
    MixedClass object;

    object.public_value = 100;

    object.public_name = "changed";

    printf("MixedClass object\n");
    printf("object.public_value = 100\n");
    printf("object.public_name = \"changed\"\n");

    // Set breakpoints inside public_function() to inspect
    // protected/private members.
    object.public_function();
}

// ------------------------------------------------------------
// 21. Inheritance / polymorphism
// ------------------------------------------------------------

class Base
{
public:
    virtual ~Base() = default;

    int base_value{10};

    virtual std::string name() const
    {
        return "Base";
    }
};

class Derived : public Base
{
public:
    std::string derived_name{"Derived"};

    double derived_value{20.5};

    std::string name() const override
    {
        return derived_name;
    }
};

class MoreDerived : public Derived
{
public:
    std::vector<int> extra_values{1, 2, 3, 4};

    std::string name() const override
    {
        return "MoreDerived";
    }
};

void debug_polymorphism()
{
    Base base;

    Derived derived;

    MoreDerived more_derived;

    Base *base_pointer = &derived;

    Base &base_reference = more_derived;

    std::unique_ptr<Base> polymorphic =
        std::make_unique<MoreDerived>();

    printf("Base base\n");
    printf("Derived derived\n");
    printf("MoreDerived more_derived\n");
    printf("Base* base_pointer = &derived\n");
    printf("Base& base_reference = more_derived\n");
    printf("std::unique_ptr<Base> polymorphic\n");
}

// ------------------------------------------------------------
// 22. Multiple inheritance
// ------------------------------------------------------------

class Left
{
public:
    int left_value{1};
};

class Right
{
public:
    std::string right_value{"right"};
};

class Multiple : public Left, public Right
{
public:
    double own_value{3.14};
};

void debug_multiple_inheritance()
{
    Multiple object;

    Left *left = &object;

    Right *right = &object;

    printf("Multiple object\n");
    printf("Left* left = &object\n");
    printf("Right* right = &object\n");
}

// ------------------------------------------------------------
// 23. Templates / nested STL
// ------------------------------------------------------------

template <typename T>
struct Box
{
    T value;
};

void debug_templates()
{
    Box<int> int_box{42};

    Box<std::string> string_box{
        "hello"};

    Box<std::vector<int>> vector_box{
        {1, 2, 3}};

    std::vector<Box<std::string>> boxes{
        {"one"},
        {"two"},
        {"three"}};

    std::map<
        std::string,
        std::vector<std::unique_ptr<Person>>>
        people;

    printf("Box<int> int_box{42}\n");
    printf("Box<std::string> string_box{...}\n");
    printf("Box<std::vector<int>> vector_box{...}\n");
    printf("std::vector<Box<std::string>> boxes{...}\n");
    printf("nested map/vector/unique_ptr people\n");
}

// ------------------------------------------------------------
// 24. Iterators
// ------------------------------------------------------------

void debug_iterators()
{
    std::vector<int> values{10, 20, 30, 40};

    auto iterator = values.begin();

    auto const_iterator = values.cbegin();

    auto reverse_iterator = values.rbegin();

    auto const_reverse_iterator = values.crbegin();

    printf("auto iterator = values.begin()\n");
    printf("auto const_iterator = values.cbegin()\n");
    printf("auto reverse_iterator = values.rbegin()\n");
    printf("auto const_reverse_iterator = values.crbegin()\n");
}

// ------------------------------------------------------------
// 25. Regex
// ------------------------------------------------------------

void debug_regex()
{
    std::regex expression{
        R"(\d{3}-\d{3}-\d{4})"};

    std::cmatch c_match;

    std::smatch match;

    std::string text{
        "phone: 123-456-7890"};

    bool matches =
        std::regex_search(text, match, expression);

    printf("std::regex expression{...}\n");
    printf("std::cmatch c_match\n");
    printf("std::smatch match\n");
    printf("bool matches = std::regex_search(...)\n");
}

// ------------------------------------------------------------
// 26. Atomic types
// ------------------------------------------------------------

void debug_atomics()
{
    std::atomic<int> atomic_int{42};

    std::atomic<bool> atomic_bool{true};

    std::atomic<std::uint64_t> atomic_counter{1000};

    printf("std::atomic<int> atomic_int{42}\n");
    printf("std::atomic<bool> atomic_bool{true}\n");
    printf("std::atomic<std::uint64_t> atomic_counter{1000}\n");
}

// ------------------------------------------------------------
// 27. Mutex / locks
// ------------------------------------------------------------

void debug_synchronization()
{
    std::mutex mutex;

    std::recursive_mutex recursive_mutex;

    std::timed_mutex timed_mutex;

    std::unique_lock<std::mutex> lock{
        mutex,
        std::defer_lock};

    std::lock_guard<std::mutex> guard{
        mutex};

    std::scoped_lock scoped{
        mutex};

    printf("std::mutex mutex\n");
    printf("std::recursive_mutex recursive_mutex\n");
    printf("std::timed_mutex timed_mutex\n");
    printf("std::unique_lock<std::mutex> lock\n");
    printf("std::lock_guard<std::mutex> guard\n");
    printf("std::scoped_lock scoped\n");
}

// ------------------------------------------------------------
// 28. Threads / futures
// ------------------------------------------------------------

void debug_concurrency()
{
    std::promise<int> promise;

    std::future<int> future =
        promise.get_future();

    std::shared_future<int> shared_future =
        future.share();

    std::packaged_task<int()> task{
        []
        {
            return 42;
        }};

    std::thread thread{
        []
        {
            // breakpoint here
        }};

    thread.join();

    printf("std::promise<int> promise\n");
    printf("std::future<int> future\n");
    printf("std::shared_future<int> shared_future\n");
    printf("std::packaged_task<int()> task\n");
    printf("std::thread thread\n");
}

// ------------------------------------------------------------
// 29. std::type_info / type_index
// ------------------------------------------------------------

void debug_type_information()
{
    const std::type_info &type_info =
        typeid(std::string);

    std::type_index type_index{
        type_info};

    printf("const std::type_info& type_info = typeid(...)\n");
    printf("std::type_index type_index{type_info}\n");
}

// ------------------------------------------------------------
// 30. std::reference_wrapper
// ------------------------------------------------------------

void debug_reference_wrapper()
{
    int value = 42;

    std::reference_wrapper<int> reference{
        value};

    std::vector<std::reference_wrapper<int>> references{
        value};

    printf("std::reference_wrapper<int> reference{value}\n");
    printf("std::vector<std::reference_wrapper<int>> references{...}\n");
}

// ------------------------------------------------------------
// 31. std::move / moved-from state
// ------------------------------------------------------------

void debug_move_state()
{
    std::string original{"hello"};

    std::string moved_to =
        std::move(original);

    std::vector<int> source{
        1, 2, 3};

    std::vector<int> destination =
        std::move(source);

    printf("std::string original{\"hello\"}\n");
    printf("std::string moved_to = std::move(original)\n");
    printf("std::vector<int> source{1, 2, 3}\n");
    printf("std::vector<int> destination = std::move(source)\n");
}

// ------------------------------------------------------------
// 32. Nested / intentionally ugly debugger types
// ------------------------------------------------------------

void debug_nested_types()
{
    std::vector<
        std::optional<
            std::variant<
                int,
                std::string,
                std::vector<double>>>>
        deeply_nested{
            42,
            std::string{"hello"},
            std::vector<double>{1.1, 2.2, 3.3}};

    std::map<
        std::string,
        std::pair<
            std::vector<int>,
            std::optional<std::string>>>
        complicated_map{
            {"first",
             {{1, 2, 3},
              "value"}}};

    std::shared_ptr<
        std::vector<
            std::unique_ptr<Person>>>
        nested_smart_pointer =
            std::make_shared<
                std::vector<
                    std::unique_ptr<Person>>>();

    printf("deeply nested vector/optional/variant\n");
    printf("complicated map/pair/vector/optional\n");
    printf("nested shared_ptr/vector/unique_ptr\n");
}

// ------------------------------------------------------------
// 33. Aggregate containing almost everything
// ------------------------------------------------------------

struct DebugMonster
{
    // STL
    std::string name;
    std::vector<int> values;
    std::map<std::string, int> map;
    std::unordered_set<std::string> tags;

    // Modern utility types
    std::optional<double> optional;
    std::variant<int, std::string, double> variant;

    // Ownership
    std::unique_ptr<Person> unique;
    std::shared_ptr<Person> shared;
    std::weak_ptr<Person> weak;

    // Tuple-like
    std::pair<int, std::string> pair;
    std::tuple<int, double, std::string> tuple;

    // Array
    std::array<int, 4> array;

    // Chrono
    std::chrono::milliseconds timeout;

    // Custom
    Person person;

    // Union
    BasicUnion union_value;
};

void debug_monster()
{
    auto person =
        std::make_shared<Person>(
            Person{"Alice", 30, 99.5});

    DebugMonster monster{
        .name = "monster",
        .values = {1, 2, 3, 4},
        .map = {{"a", 1}, {"b", 2}},
        .tags = {"debug", "test"},
        .optional = 3.14,
        .variant = std::string{"variant"},
        .unique = std::make_unique<Person>(
            Person{"Unique", 1, 2.0}),
        .shared = person,
        .weak = person,
        .pair = {42, "pair"},
        .tuple = {1, 2.0, "tuple"},
        .array = {10, 20, 30, 40},
        .timeout = std::chrono::milliseconds{500},
        .person = {"Embedded", 50, 75.0},
        .union_value = BasicUnion{}};

    monster.union_value.integer = 123;

    printf("DebugMonster monster{...}\n");
}

void debug_variable_states()
{
    // Empty
    std::vector<int> empty_vector;

    // Singleton
    std::vector<int> singleton{42};

    // Large
    std::vector<int> large_vector(10000, 42);

    // Null
    std::unique_ptr<Person> null_pointer;

    // Optional disengaged
    std::optional<int> missing;

    // Variant with different active alternatives
    std::variant<int, std::string> variant_int{42};
    std::variant<int, std::string> variant_string{"hello"};

    // Moved-from
    std::string source{"source"};
    std::string destination{std::move(source)};

    // Empty containers
    std::map<std::string, int> empty_map;
    std::set<int> empty_set;

    // Deep nesting
    std::vector<std::vector<std::vector<int>>> nested{
        {{1, 2}, {3, 4}},
        {{5, 6}}};

    // Aliasing
    auto shared_a = std::make_shared<Person>(
        Person{"Shared", 1, 2.0});

    auto shared_b = shared_a;

    // Weak reference
    std::weak_ptr<Person> weak = shared_a;

    // Iterator into container
    auto iterator = nested[0].begin();

    // References
    Person &person_reference = *shared_a;

    // Lambda captures
    int captured_value = 42;

    auto lambda = [captured_value,
                   shared_a](int argument)
    {
        return captured_value + argument +
               shared_a->age;
    };

    // Function object
    std::function<int(int)> function =
        lambda;

    // Structured bindings
    auto [name, age, score] = *shared_a;

    printf("variable-state debugger corpus\n");
}

void primitives()
{
    bool b = false;
    printf("bool b = false\n");
    debug(), b;
    char c = 'c';
    printf("char c = 'c'\n");
    debug(), c;
    signed char sc = -12;
    printf("signed char sc = -12\n");
    debug(), sc;
    unsigned char uc = 250;
    printf("unsigned char uc = 250\n");
    debug(), uc;
    short sh = 3;
    printf("short sh = 3\n");
    debug(), sh;
    short int si = -13;
    printf("short int si = -13\n");
    debug(), si;
    signed short ss = 534;
    printf("signed short ss = 534\n");
    debug(), ss;
    signed short int ssi = -654;
    printf("signed short int ssi = -654\n");
    debug(), ssi;
    unsigned short us = 123;
    printf("unsigned short us = 123\n");
    debug(), us;
    unsigned short int usi = 43;
    printf("unsigned short int usi = 43\n");
    debug(), usi;
    int i = 0;
    printf("int i = 0\n");
    debug(), i;
    signed s = 1;
    printf("signed s = 1\n");
    debug(), s;
    signed int sii = -54;
    printf("signed int sii = -54\n");
    debug(), sii;
    unsigned u = 0;
    printf("unsigned u = 0\n");
    debug(), u;
    unsigned int ui = 54;
    printf("unsigned int ui = 54\n");
    debug(), ui;
    long l = -5226349;
    printf("long l = -5226349\n");
    debug(), l;
    long int li = 5226349;
    printf("long int li = 5226349\n");
    debug(), li;
    signed long sl = 67896978;
    printf("signed long sl = 67896978\n");
    debug(), sl;
    signed long int sli = -64378926;
    printf("signed long int sli = -64378926\n");
    debug(), sli;
    unsigned long ul = 798;
    printf("unsigned long ul = 798\n");
    debug(), ul;
    unsigned long int uli = 7899;
    printf("unsigned long int uli = 7899\n");
    debug(), uli;
    unsigned long long ull = 4673489;
    printf("unsigned long long ull = 4673489\n");
    debug(), ull;
    unsigned long long int ulli = 56347895634978;
    printf("unsigned long long int ulli = 56347895634978\n");
    debug(), ulli;
    float f = -432.432;
    printf("float f = -432.432\n");
    debug(), f;
    double d = 43242.43;
    printf("double d = 43242.43\n");
    debug(), d;
    long double ld = 423413412.4123412;
    printf("long double ld = 423413412.4123412\n");
    debug(), ld;
}

int main()
{
    // primitives();
    // debug_strings();
    // debug_sequence_containers();
    // debug_associative_containers();
    // debug_container_adaptors();

    // debug_tuple_types();
    // debug_dynamic_types();

    // debug_smart_pointers();
    // debug_reference_types();
    // debug_function_types();

    // debug_initializer_lists();
    // debug_span();

    // debug_chrono();
    // debug_numeric_library_types();
    // debug_random();

    // debug_enums();
    // debug_arrays();
    // debug_unions();
    // debug_anonymous_union();

    // debug_structs();
    // debug_mixed_class();
    // debug_polymorphism();
    // debug_multiple_inheritance();
    // debug_templates();

    // debug_iterators();
    // debug_regex();

    // debug_atomics();
    // debug_synchronization();
    // debug_concurrency();

    // debug_type_information();
    // debug_reference_wrapper();
    // debug_move_state();

    // debug_nested_types();
    // debug_monster();
    // debug_variable_states();
}

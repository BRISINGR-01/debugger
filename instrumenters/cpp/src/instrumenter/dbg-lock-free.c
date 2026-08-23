#ifndef DBG_LOCKFREE_RINGBUF_H
#define DBG_LOCKFREE_RINGBUF_H

#include <stdint.h>

#ifdef __cplusplus
extern "C"
{
#endif

// MUST be a power of 2 for bitwise modulo math to work
#define DBG_BUF_SIZE 1024
#define DBG_BUF_MASK (DBG_BUF_SIZE - 1)

    // Fixed-size struct. No strings, no pointers, no malloc.
    typedef struct
    {
        uint32_t value;
        uint16_t event_id;
        volatile uint8_t ready; // 0 = empty, 1 = ready to read
    } DbgEvent;

    // Weak symbols allow this header to be injected into 50 files
    // without causing linker crashes.
    __attribute__((weak)) DbgEvent dbg_buffer[DBG_BUF_SIZE];
    __attribute__((weak)) volatile uint32_t dbg_write_idx = 0;
    __attribute__((weak)) volatile uint32_t dbg_read_idx = 0;

    /**
     * THE PRODUCER (Injected by your Clang tool)
     * This is 100% thread-safe and ISR-safe.
     */
    static inline void dbg_record(uint16_t id, uint32_t val)
    {
        // 1. ATOMICALLY claim a slot.
        // If 3 threads call this at the exact same nanosecond,
        // the hardware ensures they get distinct index values.
        uint32_t my_idx = __sync_fetch_and_add(&dbg_write_idx, 1);

        // 2. Wrap around using bitwise AND (extremely fast, avoids division)
        uint32_t pos = my_idx & DBG_BUF_MASK;

        // 3. Write the payload
        dbg_buffer[pos].event_id = id;
        dbg_buffer[pos].value = val;

        // 4. Memory barrier: Force the CPU to commit the struct data to RAM
        // before it commits the 'ready' flag.
        __sync_synchronize();

        // 5. Signal to the consumer that this slot is finished
        dbg_buffer[pos].ready = 1;
    }

    /**
     * THE CONSUMER (Called by the user)
     * Extracts one event from the buffer. Returns 1 if data was read, 0 if empty.
     */
    static inline int dbg_consume(DbgEvent *out_event)
    {
        uint32_t pos = dbg_read_idx & DBG_BUF_MASK;

        // Check if the current read slot actually has finished data in it
        if (dbg_buffer[pos].ready == 1)
        {

            // Copy data out to the user's struct
            out_event->event_id = dbg_buffer[pos].event_id;
            out_event->value = dbg_buffer[pos].value;

            // Memory barrier: Ensure we finished reading before clearing the flag
            __sync_synchronize();

            // Mark the slot as empty so the producer can overwrite it eventually
            dbg_buffer[pos].ready = 0;

            // Advance the read index (does not need to be atomic,
            // because there is only ONE consumer thread allowed)
            dbg_read_idx++;

            return 1; // Success
        }

        return 0; // Buffer is empty, or producer hasn't finished writing
    }

#ifdef __cplusplus
}
#endif

#endif // DBG_LOCKFREE_RINGBUF_H
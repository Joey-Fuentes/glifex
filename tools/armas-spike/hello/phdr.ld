/* Minimal linker script whose ONLY job is to force a PT_PHDR.
 * Hypothesis: GNU ld emits PT_PHDR mainly when a PT_INTERP exists (PHDR must
 * precede INTERP), and --no-dynamic-linker removes INTERP -- so our static PIE
 * may have no PT_PHDR at all. A static PIE must find its own program headers to
 * compute its load bias, which is what "Could not find a PHDR" sounds like.
 * Declaring PHDRS explicitly is the way to force it; there is no ld flag.
 * This is a HYPOTHESIS. The readelf dump in the log is what actually settles it. */
ENTRY(_start)

PHDRS
{
  headers PT_PHDR PHDRS ;
  text    PT_LOAD FILEHDR PHDRS ;
}

SECTIONS
{
  . = SIZEOF_HEADERS;
  .text : { *(.text*) } :text
  /DISCARD/ : { *(.comment) *(.note*) *(.eh_frame*) }
}

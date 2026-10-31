//! Starting programs. On Windows a console program started from a GUI app opens a console
//! window, and there are no process groups: a run goes into a Job Object instead, so
//! cancelling it ends every process it started (latexmk, perl, the engine…).

use std::ffi::OsStr;
use std::process::Command;

/// `Command` for `program`, the only way LibreTeX starts programs. On Windows, without a
/// console window.
pub fn command(program: impl AsRef<OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
    }
    command
}

#[cfg(windows)]
pub use job::Job;

#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, TH32CS_SNAPTHREAD, THREADENTRY32, Thread32First, Thread32Next,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, TerminateJobObject,
    };
    use windows_sys::Win32::System::Threading::{OpenThread, ResumeThread, THREAD_SUSPEND_RESUME};

    /// A Job Object holding a run and everything it starts.
    pub struct Job(HANDLE);

    // SAFETY: a job handle can be used and closed from any thread.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    impl Job {
        /// Puts `child`, started with `CREATE_SUSPENDED` (so it cannot start anything before
        /// being in the job), in a new job and lets it run. Without a job (it could not be
        /// created) cancelling cannot end it. If it cannot be resumed, it is killed.
        pub fn adopt(child: &mut Child) -> std::io::Result<Option<Job>> {
            // SAFETY: creates an unnamed job with default security; checked for null.
            let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            let job = (!handle.is_null()).then_some(Job(handle));
            if let Some(job) = &job {
                // SAFETY: both handles are open: the job's is ours, `child` keeps its own.
                unsafe { AssignProcessToJobObject(job.0, child.as_raw_handle() as HANDLE) };
            }
            if !resume(child.id()) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(std::io::Error::other("no se pudo reanudar el proceso"));
            }
            Ok(job)
        }

        /// Ends every process of the job.
        pub fn terminate(&self) {
            // SAFETY: the handle is open until `drop`.
            unsafe { TerminateJobObject(self.0, 1) };
        }

        /// The processes running in the job now (the first 64).
        #[cfg(test)]
        pub fn pids(&self) -> Vec<u32> {
            use windows_sys::Win32::System::JobObjects::{
                JobObjectBasicProcessIdList, QueryInformationJobObject,
            };
            /// `JOBOBJECT_BASIC_PROCESS_ID_LIST` with room for 64 processes.
            #[repr(C)]
            struct List {
                assigned: u32,
                listed: u32,
                ids: [usize; 64],
            }
            let mut list = List {
                assigned: 0,
                listed: 0,
                ids: [0; 64],
            };
            // SAFETY: the buffer is a correctly laid out list and its size is passed.
            let ok = unsafe {
                QueryInformationJobObject(
                    self.0,
                    JobObjectBasicProcessIdList,
                    (&raw mut list).cast(),
                    size_of::<List>() as u32,
                    std::ptr::null_mut(),
                )
            };
            if ok == 0 {
                return Vec::new();
            }
            list.ids[..list.listed as usize]
                .iter()
                .map(|&id| id as u32)
                .collect()
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: the handle is ours and is closed only here.
            unsafe { CloseHandle(self.0) };
        }
    }

    /// Resumes the threads of the suspended process `pid` (std does not give the handle of
    /// its main thread). Whether one was resumed.
    fn resume(pid: u32) -> bool {
        // SAFETY: a snapshot of the system's threads, walked with a correctly sized entry;
        // every handle opened here is closed here.
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return false;
            }
            let mut entry: THREADENTRY32 = std::mem::zeroed();
            entry.dwSize = size_of::<THREADENTRY32>() as u32;
            let mut resumed = false;
            let mut more = Thread32First(snapshot, &mut entry) != 0;
            while more {
                if entry.th32OwnerProcessID == pid {
                    let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                    if !thread.is_null() {
                        resumed |= ResumeThread(thread) != u32::MAX;
                        CloseHandle(thread);
                    }
                }
                more = Thread32Next(snapshot, &mut entry) != 0;
            }
            CloseHandle(snapshot);
            resumed
        }
    }
}

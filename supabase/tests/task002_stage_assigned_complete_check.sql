-- STATUS: draft; isolation / local only. NOT for formal.
-- TASK-002：stage_wf 允許 assigned→completed；file_asg 仍不可跳過。

begin;

do $$
begin
  perform private.p0b_assert_status_transition('stage_wf', 'assigned', 'completed', false);
  perform private.p0b_assert_status_transition('stage_wf', 'in_progress', 'completed', false);
  perform private.p0b_assert_status_transition('stage_wf', 'completed', 'in_progress', false);

  begin
    perform private.p0b_assert_status_transition('file_asg', 'assigned', 'completed', false);
    raise exception 'file_asg assigned to completed should still fail';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform private.p0b_assert_status_transition('view_asg', 'assigned', 'completed', false);
    raise exception 'view_asg assigned to completed should still fail';
  exception
    when sqlstate '22023' then null;
  end;
end $$;

rollback;
